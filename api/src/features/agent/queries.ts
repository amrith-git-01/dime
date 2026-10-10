import { formatCents } from '../../core/decimal';
import { all, batch, first } from '../../core/db';
import type { Db, SqlParam } from '../../core/db';
import { log } from '../../core/logging';
import { dateKey, localDate } from '../../core/timezone';
import { normalizeCounterparty } from '../transactions/dedupe';
import { dayTotalsFromRows } from '../transactions/aggregates';
import { weekdayName } from './dates';
import { similarityOfSets, trigramSequence, trigramSet, wordSimilarityOf } from './trigram';

/**
 * The agent's data queries on D1. One function per tool; each takes the user id from the verified token
 * (never from the model), binds EVERY value (the only SQL text built here comes from fixed fragments
 * chosen by validated enums), and returns the JSON document the shapers in `tools.ts` expect. Money is integer cents in D1 and rupee numbers in the documents (`cents / 100`). Ranges are half-open
 * (`from <= transaction_at < to`, ISO-8601 UTC text, which orders like time) and soft-deleted rows never count.
 * Optional keys are left out instead of being null.
 */

export type QueryName =
  | 'resolve_entities'
  | 'spending_summary'
  | 'category_breakdown'
  | 'top_payees'
  | 'daily_cashflow'
  | 'compare_periods'
  | 'budget_status'
  | 'list_transactions'
  | 'aggregate_transactions';

export type TxType = 'debit' | 'credit';
export type ListOrder = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
export type AggMetric = 'sum' | 'avg' | 'count' | 'count_distinct_payees';
export type AggGroup = 'none' | 'weekday' | 'month' | 'category' | 'payee';

interface Range {
  /** Inclusive ISO-8601 UTC instant. */
  from: string;
  /** Exclusive ISO-8601 UTC instant. */
  to: string;
}

export interface QueryParams {
  resolve_entities: { phrases: readonly string[] };
  spending_summary: Range & { categoryId: string | null; payeeKey: string | null };
  category_breakdown: Range & { type: TxType };
  top_payees: Range & { categoryId: string | null; limit: number };
  daily_cashflow: Range & { tz: string };
  compare_periods: { a: Range; b: Range; by: 'total' | 'category' | 'payee' };
  budget_status: Range;
  list_transactions: Range & {
    tz: string;
    categoryId: string | null;
    payeeKey: string | null;
    minCents: number | null;
    type: TxType | null;
    order: ListOrder;
    limit: number;
  };
  aggregate_transactions: Range & {
    tz: string;
    metric: AggMetric;
    groupBy: AggGroup;
    type: TxType | 'both';
    /** A category uuid or a category name. */
    category: string | null;
    /** A payee key or a payee name. */
    payee: string | null;
    minCents: number | null;
    maxCents: number | null;
  };
}

export type QueryCall = { [K in QueryName]: { name: K; params: QueryParams[K] } }[QueryName];

export type AgentQueries = { [K in QueryName]: (db: Db, userId: string, params: QueryParams[K]) => Promise<unknown> };

/** A failure the model can act on (unknown category name...): its message goes back to the model verbatim. */
export class QueryUserError extends Error {
  override name = 'QueryUserError';
}

type Doc = Record<string, unknown>;

/* ----------------------------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------------------------- */

const rupees = (cents: number): number => cents / 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `round(n / d)` half away from zero, for integers (d > 0). */
function roundDiv(n: number, d: number): number {
  const q = Math.floor((2 * Math.abs(n) + d) / (2 * d));
  return n < 0 ? -q : q;
}

/** `round(part * 100 / whole, 1)` like Postgres numeric (half away from zero), 0 when there is no whole. */
function percent1(part: number, whole: number): number {
  return whole > 0 ? roundDiv(part * 1000, whole) / 10 : 0;
}

/** Visible to the user: system categories and their own. */
const VISIBLE_CATEGORY = '(c.is_system = 1 OR c.user_id = ?)';

interface TxFilter {
  type?: TxType | null;
  categoryId?: string | null;
  payeeKey?: string | null;
  minCents?: number | null;
  maxCents?: number | null;
}

/** `WHERE` for alias `t`: the user's live rows in the half-open range, plus the optional filters. */
function where(userId: string, range: Range, f: TxFilter = {}): { sql: string; params: SqlParam[] } {
  const parts = ['t.user_id = ?', 't.deleted_at IS NULL', 't.transaction_at >= ?', 't.transaction_at < ?'];
  const params: SqlParam[] = [userId, range.from, range.to];
  if (f.type) {
    parts.push('t.type = ?');
    params.push(f.type);
  }
  if (f.categoryId) {
    parts.push('t.category_id = ?');
    params.push(f.categoryId);
  }
  if (f.payeeKey) {
    parts.push('t.payee_key = ?');
    params.push(f.payeeKey);
  }
  if (f.minCents != null) {
    parts.push('t.amount >= ?');
    params.push(f.minCents);
  }
  if (f.maxCents != null) {
    parts.push('t.amount <= ?');
    params.push(f.maxCents);
  }
  return { sql: parts.join(' AND '), params };
}

/**
 * Display name of a payee group: the name of its OLDEST row with a non-empty name (the first non-null name when
 * ordered by `transaction_at`). SQLite returns a bare column from
 * the row of the single MIN() aggregate, so `raw_name` is that row's name; `named_at` is NULL when no row
 * of the group has a name.
 */
const PAYEE_NAME_COLUMNS = `MIN(CASE WHEN TRIM(COALESCE(t.counterparty_name, '')) <> '' THEN t.transaction_at END) AS named_at, t.counterparty_name AS raw_name`;

interface NamedGroup {
  named_at: string | null;
  raw_name: string | null;
}
const payeeName = (g: NamedGroup): string => (g.named_at ? (g.raw_name ?? '').trim() || 'Unknown' : 'Unknown');

/* ----------------------------------------------------------------------------------------------
 * resolve_entities (pg_trgm in TypeScript)
 * -------------------------------------------------------------------------------------------- */

/** Word-similarity cut-off, lowered to 0.4 (from pg_trgm's 0.6 default) so typos survive. */
const MATCH_THRESHOLD = Math.fround(0.4);
const MAX_PHRASES = 8;
const PER_TYPE = 3;
/**
 * ponytail: only the 400 most used (payee_key, name) pairs are scored, so CPU stays bounded for users with
 * thousands of one-off payees. A payee outside the top 400 can only be found through its category or
 * the transaction list; revisit with an FTS5 table if that ever shows up.
 */
const PAYEE_SCAN_LIMIT = 400;

interface PayeeCandidate {
  key: string;
  name: string;
  n: number;
  trigrams: string[];
  set: Set<string>;
}

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

async function resolveEntities(db: Db, userId: string, p: QueryParams['resolve_entities']): Promise<Doc> {
  const phrases = [...new Set(p.phrases.map((x) => x.trim().toLowerCase()).filter((x) => Array.from(x).length >= 2))].slice(0, MAX_PHRASES);
  if (phrases.length === 0) return { matches: [] };

  const [payeeRows, categoryRows] = await batch<Record<string, unknown>>(db, [
    db
      .prepare(
        `SELECT payee_key AS key, counterparty_name AS name, COUNT(*) AS n FROM transactions
         WHERE user_id = ? AND deleted_at IS NULL AND counterparty_name IS NOT NULL
         GROUP BY payee_key, counterparty_name ORDER BY n DESC, payee_key LIMIT ?`,
      )
      .bind(userId, PAYEE_SCAN_LIMIT),
    db.prepare(`SELECT c.id, c.name FROM categories c WHERE ${VISIBLE_CATEGORY}`).bind(userId),
  ]);

  const payees: PayeeCandidate[] = (payeeRows ?? []).map((r) => {
    const name = String(r['name']);
    const trigrams = trigramSequence(name);
    return { key: String(r['key']), name, n: Number(r['n']), trigrams, set: new Set(trigrams) };
  });
  const categories = (categoryRows ?? []).map((r) => {
    const name = String(r['name']);
    const trigrams = trigramSequence(name);
    return { id: String(r['id']), name, trigrams, set: new Set(trigrams) };
  });

  interface Hit {
    phrase: string;
    type: 'payee' | 'category';
    id: string;
    name: string;
    ws: number;
    sim: number;
    n: number;
  }
  const hits: Hit[] = [];

  for (const phrase of phrases) {
    const q = trigramSet(phrase);

    // Payees: rows below the threshold are dropped BEFORE grouping (like `phrase <% name` in the WHERE).
    const groups = new Map<string, { ws: number; sim: number; n: number; names: Map<string, number> }>();
    for (const c of payees) {
      const ws = wordSimilarityOf(q, c.trigrams);
      if (ws < MATCH_THRESHOLD) continue;
      const g = groups.get(c.key) ?? { ws: 0, sim: 0, n: 0, names: new Map<string, number>() };
      g.ws = Math.max(g.ws, ws);
      g.sim = Math.max(g.sim, similarityOfSets(q, c.set));
      g.n += c.n;
      g.names.set(c.name, (g.names.get(c.name) ?? 0) + c.n);
      groups.set(c.key, g);
    }
    const payeeHits: Hit[] = [...groups].map(([key, g]) => {
      // mode(): the most frequent name, the smallest on a tie.
      const name = [...g.names].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0]?.[0] ?? '';
      return { phrase, type: 'payee', id: key, name, ws: g.ws, sim: g.sim, n: g.n };
    });
    payeeHits.sort((a, b) => b.ws - a.ws || b.sim - a.sim || b.n - a.n || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    hits.push(...payeeHits.slice(0, PER_TYPE));

    const categoryHits: Hit[] = [];
    for (const c of categories) {
      const ws = wordSimilarityOf(q, c.trigrams);
      if (ws < MATCH_THRESHOLD) continue;
      categoryHits.push({ phrase, type: 'category', id: c.id, name: c.name, ws, sim: similarityOfSets(q, c.set), n: 0 });
    }
    categoryHits.sort((a, b) => b.ws - a.ws || b.sim - a.sim || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    hits.push(...categoryHits.slice(0, PER_TYPE));
  }

  hits.sort((a, b) => b.ws - a.ws || b.sim - a.sim || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    matches: hits.map((h) => ({ phrase: h.phrase, type: h.type, id: h.id, name: h.name, score: round3(h.ws), similarity: round3(h.sim), txn_count: h.n })),
  };
}

/* ----------------------------------------------------------------------------------------------
 * spending_summary
 * -------------------------------------------------------------------------------------------- */

async function spendingSummary(db: Db, userId: string, p: QueryParams['spending_summary']): Promise<Doc> {
  const w = where(userId, p, { categoryId: p.categoryId, payeeKey: p.payeeKey });
  const row = await first<Record<string, number>>(
    db,
    `SELECT COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount END), 0) AS debit,
            COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount END), 0) AS credit,
            COUNT(CASE WHEN t.type = 'debit' THEN 1 END) AS debit_count,
            COUNT(CASE WHEN t.type = 'credit' THEN 1 END) AS credit_count,
            COUNT(*) AS count
     FROM transactions t WHERE ${w.sql}`,
    w.params,
  );
  const debit = row?.['debit'] ?? 0;
  const credit = row?.['credit'] ?? 0;
  return {
    debit: rupees(debit),
    credit: rupees(credit),
    net: rupees(credit - debit),
    debit_count: row?.['debit_count'] ?? 0,
    credit_count: row?.['credit_count'] ?? 0,
    count: row?.['count'] ?? 0,
  };
}

/* ----------------------------------------------------------------------------------------------
 * category_breakdown
 * -------------------------------------------------------------------------------------------- */

const BREAKDOWN_TOP = 8;

async function categoryBreakdown(db: Db, userId: string, p: QueryParams['category_breakdown']): Promise<Doc> {
  const type = p.type === 'credit' ? 'credit' : 'debit';
  const w = where(userId, p, { type });
  const rows = await all<{ category_id: string | null; name: string; total: number; n: number }>(
    db,
    `SELECT t.category_id, COALESCE(c.name, 'Uncategorized') AS name, SUM(t.amount) AS total, COUNT(*) AS n
     FROM transactions t LEFT JOIN categories c ON c.id = t.category_id AND ${VISIBLE_CATEGORY}
     WHERE ${w.sql}
     GROUP BY t.category_id
     ORDER BY total DESC, n DESC, COALESCE(c.name, '')`,
    [userId, ...w.params],
  );
  const grand = rows.reduce((s, r) => s + r.total, 0);
  const count = rows.reduce((s, r) => s + r.n, 0);
  const rest = rows.slice(BREAKDOWN_TOP);
  const doc: Doc = {
    type,
    total: rupees(grand),
    count,
    categories: rows.slice(0, BREAKDOWN_TOP).map((r) => ({
      ...(r.category_id ? { category_id: r.category_id } : {}),
      name: r.name,
      total: rupees(r.total),
      count: r.n,
      share: percent1(r.total, grand),
    })),
  };
  if (rest.length > 0) {
    const restTotal = rest.reduce((s, r) => s + r.total, 0);
    doc['other'] = { categories: rest.length, total: rupees(restTotal), count: rest.reduce((s, r) => s + r.n, 0), share: percent1(restTotal, grand) };
  }
  return doc;
}

/* ----------------------------------------------------------------------------------------------
 * top_payees
 * -------------------------------------------------------------------------------------------- */

async function topPayees(db: Db, userId: string, p: QueryParams['top_payees']): Promise<Doc> {
  const w = where(userId, p, { type: 'debit', categoryId: p.categoryId });
  const limit = Math.min(Math.max(Math.trunc(p.limit || 5), 1), 10);
  const [grandRows, topRows] = await batch<Record<string, unknown>>(db, [
    db.prepare(`SELECT COALESCE(SUM(t.amount), 0) AS total, COUNT(DISTINCT t.payee_key) AS payees FROM transactions t WHERE ${w.sql}`).bind(...w.params),
    db
      .prepare(
        `SELECT t.payee_key AS pkey, SUM(t.amount) AS total, COUNT(*) AS n, ${PAYEE_NAME_COLUMNS}
         FROM transactions t WHERE ${w.sql}
         GROUP BY t.payee_key ORDER BY total DESC, n DESC, t.payee_key LIMIT ?`,
      )
      .bind(...w.params, limit),
  ]);
  const grand = Number(grandRows?.[0]?.['total'] ?? 0);
  return {
    total: rupees(grand),
    payee_count: Number(grandRows?.[0]?.['payees'] ?? 0),
    payees: (topRows ?? []).map((r) => ({
      payee_key: String(r['pkey']),
      name: payeeName(r as unknown as NamedGroup),
      total: rupees(Number(r['total'])),
      count: Number(r['n']),
      share: percent1(Number(r['total']), grand),
    })),
  };
}

/* ----------------------------------------------------------------------------------------------
 * daily_cashflow (days are LOCAL days, bucketed in TypeScript: SQLite has no IANA zones)
 * -------------------------------------------------------------------------------------------- */

async function dailyCashflow(db: Db, userId: string, p: QueryParams['daily_cashflow']): Promise<Doc> {
  const w = where(userId, p);
  const rows = await all<{ amount: number; type: string; transaction_at: string }>(
    db,
    `SELECT t.amount, t.type, t.transaction_at FROM transactions t WHERE ${w.sql}`,
    w.params,
  );
  const days = dayTotalsFromRows(
    rows.map((r) => ({ amount: formatCents(r.amount), type: r.type, transaction_at: r.transaction_at })),
    p.tz,
  );
  const debitTotal = days.reduce((s, d) => s + d.debitCents, 0);
  const creditTotal = days.reduce((s, d) => s + d.creditCents, 0);
  // Biggest spending day: highest debit, the earlier day on a tie (days are sorted ascending).
  let peak: (typeof days)[number] | undefined;
  for (const d of days) if (d.debitCents > 0 && (!peak || d.debitCents > peak.debitCents)) peak = d;
  return {
    debit_total: rupees(debitTotal),
    credit_total: rupees(creditTotal),
    active_days: days.length,
    ...(peak ? { peak_debit_day: { date: peak.day, debit: rupees(peak.debitCents) } } : {}),
    days: days.map((d) => ({ date: d.day, debit: rupees(d.debitCents), credit: rupees(d.creditCents) })),
  };
}

/* ----------------------------------------------------------------------------------------------
 * compare_periods
 * -------------------------------------------------------------------------------------------- */

const COMPARE_TOP = 8;

async function comparePeriods(db: Db, userId: string, p: QueryParams['compare_periods']): Promise<Doc> {
  const { a, b, by } = p;
  const inA = 't.transaction_at >= ? AND t.transaction_at < ?';
  const aParams: SqlParam[] = [a.from, a.to];
  const bParams: SqlParam[] = [b.from, b.to];
  const scope = `t.user_id = ? AND t.deleted_at IS NULL AND ((${inA}) OR (${inA}))`;
  const scopeParams: SqlParam[] = [userId, ...aParams, ...bParams];
  // Every period test is one `?, ?` placeholder pair (the period's bounds), bound by `periodParams` in order.
  const sumIn = (cond = '1 = 1'): string => `COALESCE(SUM(CASE WHEN ${inA} AND ${cond} THEN t.amount END), 0)`;
  const periodParams = (period: 'a' | 'b'): SqlParam[] => (period === 'a' ? aParams : bParams);

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `SELECT ${sumIn("t.type = 'debit'")} AS a_debit, ${sumIn("t.type = 'credit'")} AS a_credit,
                COUNT(CASE WHEN ${inA} THEN 1 END) AS a_count,
                ${sumIn("t.type = 'debit'")} AS b_debit, ${sumIn("t.type = 'credit'")} AS b_credit,
                COUNT(CASE WHEN ${inA} THEN 1 END) AS b_count
         FROM transactions t WHERE ${scope}`,
      )
      .bind(...periodParams('a'), ...periodParams('a'), ...periodParams('a'), ...periodParams('b'), ...periodParams('b'), ...periodParams('b'), ...scopeParams),
  ];

  if (by === 'category' || by === 'payee') {
    const key = by === 'category' ? 't.category_id' : 't.payee_key';
    const nameColumns = by === 'category' ? `COALESCE(c.name, 'Uncategorized') AS cname` : PAYEE_NAME_COLUMNS;
    const join = by === 'category' ? `LEFT JOIN categories c ON c.id = t.category_id AND ${VISIBLE_CATEGORY}` : '';
    const joinParams: SqlParam[] = by === 'category' ? [userId] : [];
    const grouped = `SELECT ${key} AS id, ${nameColumns}, ${sumIn()} AS a, ${sumIn()} AS b
                     FROM transactions t ${join} WHERE ${scope} AND t.type = 'debit' GROUP BY ${key}`;
    const groupedParams: SqlParam[] = [...periodParams('a'), ...periodParams('b'), ...joinParams, ...scopeParams];
    const nameOf = by === 'category' ? 'cname' : `CASE WHEN named_at IS NULL THEN 'Unknown' ELSE TRIM(COALESCE(raw_name, '')) END`;
    statements.push(
      db.prepare(`SELECT * FROM (${grouped}) ORDER BY MAX(a, b) DESC, ${nameOf}, id LIMIT ${COMPARE_TOP}`).bind(...groupedParams),
      db.prepare(`SELECT COUNT(*) AS groups FROM (${grouped})`).bind(...groupedParams),
    );
  }

  const [totals, top, groupCount] = await batch<Record<string, unknown>>(db, statements);
  const t = totals?.[0] ?? {};
  const n = (k: string): number => Number(t[k] ?? 0);
  const aDebit = n('a_debit');
  const aCredit = n('a_credit');
  const bDebit = n('b_debit');
  const bCredit = n('b_credit');

  const pct = (cur: number, base: number): number | undefined => (base > 0 ? roundDiv((cur - base) * 1000, base) / 10 : undefined);
  const delta: Doc = { debit: rupees(aDebit - bDebit) };
  const debitPct = pct(aDebit, bDebit);
  if (debitPct !== undefined) delta['debit_pct'] = debitPct;
  delta['credit'] = rupees(aCredit - bCredit);
  const creditPct = pct(aCredit, bCredit);
  if (creditPct !== undefined) delta['credit_pct'] = creditPct;
  delta['net'] = rupees(aCredit - aDebit - (bCredit - bDebit));

  const doc: Doc = {
    by: by === 'category' || by === 'payee' ? by : 'total',
    a: { debit: rupees(aDebit), credit: rupees(aCredit), net: rupees(aCredit - aDebit), count: n('a_count') },
    b: { debit: rupees(bDebit), credit: rupees(bCredit), net: rupees(bCredit - bDebit), count: n('b_count') },
    delta,
  };

  if (top && top.length > 0) {
    let sumA = 0;
    let sumB = 0;
    doc['rows'] = top.map((r) => {
      const ra = Number(r['a']);
      const rb = Number(r['b']);
      sumA += ra;
      sumB += rb;
      const name = by === 'category' ? String(r['cname']) : payeeName(r as unknown as NamedGroup);
      const rowPct = pct(ra, rb);
      return {
        ...(typeof r['id'] === 'string' ? { id: r['id'] } : {}),
        name,
        a: rupees(ra),
        b: rupees(rb),
        delta: rupees(ra - rb),
        ...(rowPct !== undefined ? { delta_pct: rowPct } : {}),
      };
    });
    const groups = Number(groupCount?.[0]?.['groups'] ?? 0);
    if (groups > COMPARE_TOP) {
      // Every debit row sits in exactly one group, so the rest is the period total minus the top rows.
      const otherA = aDebit - sumA;
      const otherB = bDebit - sumB;
      doc['other'] = { items: groups - COMPARE_TOP, a: rupees(otherA), b: rupees(otherB), delta: rupees(otherA - otherB) };
    }
  }
  return doc;
}

/* ----------------------------------------------------------------------------------------------
 * budget_status
 * -------------------------------------------------------------------------------------------- */

async function budgetStatus(db: Db, userId: string, p: QueryParams['budget_status']): Promise<Doc> {
  const w = where(userId, p, { type: 'debit' });
  const [spentRows, budgetRows, catRows] = await batch<Record<string, unknown>>(db, [
    db.prepare(`SELECT COALESCE(SUM(t.amount), 0) AS total FROM transactions t WHERE ${w.sql}`).bind(...w.params),
    db.prepare('SELECT monthly_budget, daily_budget FROM budgets WHERE user_id = ? LIMIT 1').bind(userId),
    db
      .prepare(
        `SELECT cb.category_id, c.name, cb.monthly_amount AS budget, COALESCE(cs.s, 0) AS spent
         FROM category_budgets cb
         JOIN categories c ON c.id = cb.category_id
         LEFT JOIN (
           SELECT t.category_id, SUM(t.amount) AS s FROM transactions t
           WHERE ${w.sql} AND t.category_id IS NOT NULL GROUP BY t.category_id
         ) cs ON cs.category_id = cb.category_id
         WHERE cb.user_id = ? AND cb.monthly_amount > 0
         ORDER BY COALESCE(cs.s, 0) * 1.0 / cb.monthly_amount DESC, c.name
         LIMIT 10`,
      )
      .bind(...w.params, userId),
  ]);
  const spent = Number(spentRows?.[0]?.['total'] ?? 0);
  const budget = budgetRows?.[0];
  const monthly = budget ? Number(budget['monthly_budget']) : 0;
  const daily = budget && budget['daily_budget'] != null ? Number(budget['daily_budget']) : 0;
  return {
    total_spent: rupees(spent),
    ...(monthly > 0
      ? {
          monthly: {
            budget: rupees(monthly),
            spent: rupees(spent),
            remaining: rupees(monthly - spent),
            pct_used: percent1(spent, monthly),
            over: spent > monthly,
          },
        }
      : {}),
    ...(daily > 0 ? { daily_budget: rupees(daily) } : {}),
    categories: (catRows ?? []).map((r) => {
      const cb = Number(r['budget']);
      const cs = Number(r['spent']);
      return {
        category_id: String(r['category_id']),
        name: String(r['name']),
        budget: rupees(cb),
        spent: rupees(cs),
        remaining: rupees(cb - cs),
        pct_used: percent1(cs, cb),
        over: cs > cb,
      };
    }),
  };
}

/* ----------------------------------------------------------------------------------------------
 * list_transactions (never returns the note)
 * -------------------------------------------------------------------------------------------- */

const MAX_LIST = 20;
/** Fixed ORDER BY fragments, chosen by the validated enum. */
const LIST_ORDER: Record<ListOrder, string> = {
  date_desc: 't.transaction_at DESC, t.id',
  date_asc: 't.transaction_at ASC, t.id',
  amount_desc: 't.amount DESC, t.transaction_at DESC, t.id',
  amount_asc: 't.amount ASC, t.transaction_at DESC, t.id',
};

async function listTransactions(db: Db, userId: string, p: QueryParams['list_transactions']): Promise<Doc> {
  const w = where(userId, p, { type: p.type, categoryId: p.categoryId, payeeKey: p.payeeKey, minCents: p.minCents });
  const limit = Math.min(Math.max(Math.trunc(p.limit || 10), 1), MAX_LIST);
  const [countRows, pageRows] = await batch<Record<string, unknown>>(db, [
    db.prepare(`SELECT COUNT(*) AS n FROM transactions t WHERE ${w.sql}`).bind(...w.params),
    db
      .prepare(
        `SELECT t.transaction_at, t.amount, t.type, COALESCE(NULLIF(TRIM(t.counterparty_name), ''), 'Unknown') AS payee,
                COALESCE(c.name, 'Uncategorized') AS category
         FROM transactions t LEFT JOIN categories c ON c.id = t.category_id AND ${VISIBLE_CATEGORY}
         WHERE ${w.sql} ORDER BY ${LIST_ORDER[p.order] ?? LIST_ORDER.date_desc} LIMIT ?`,
      )
      .bind(userId, ...w.params, limit),
  ]);
  const total = Number(countRows?.[0]?.['n'] ?? 0);
  return {
    total_count: total,
    rows: (pageRows ?? []).map((r) => ({
      date: dateKey(localDate(p.tz, Date.parse(String(r['transaction_at'])))),
      amount: rupees(Number(r['amount'])),
      type: String(r['type']),
      payee: String(r['payee']),
      category: String(r['category']),
    })),
    truncated: total > limit,
  };
}

/* ----------------------------------------------------------------------------------------------
 * aggregate_transactions (replaces run_sql: a fixed, parameterized aggregate)
 * -------------------------------------------------------------------------------------------- */

const AGG_MAX_ROWS = 12;
/**
 * ponytail: weekday and month buckets are cut in TypeScript, so those two groupings read the matching
 * rows (3 columns each). Capped so one question cannot read the whole ledger of a heavy user.
 */
const AGG_SCAN_LIMIT = 20000;

/** SQL expression ranking groups for ORDER BY (fixed fragments, chosen by the validated metric). */
const AGG_RANK: Record<AggMetric, string> = {
  sum: 'SUM(t.amount)',
  avg: 'SUM(t.amount) * 1.0 / COUNT(*)',
  count: 'COUNT(*)',
  count_distinct_payees: 'COUNT(DISTINCT t.payee_key)',
};

interface AggAcc {
  sum: number;
  n: number;
  payees: number;
}

function aggValue(metric: AggMetric, a: AggAcc): number {
  switch (metric) {
    case 'sum':
      return a.sum;
    case 'avg':
      return a.n > 0 ? roundDiv(a.sum, a.n) : 0;
    case 'count':
      return a.n;
    case 'count_distinct_payees':
      return a.payees;
  }
}

/** Money metrics are cents in D1 and rupees in the document; counts stay counts. */
const aggOut = (metric: AggMetric, value: number): number => (metric === 'sum' || metric === 'avg' ? rupees(value) : value);

async function aggregateTransactions(db: Db, userId: string, p: QueryParams['aggregate_transactions']): Promise<Doc> {
  // Category: a uuid, or a name resolved among the categories the user can see.
  let categoryId: string | null = null;
  if (p.category) {
    const given = p.category.trim();
    if (UUID_RE.test(given)) categoryId = given.toLowerCase();
    else {
      const row = await first<{ id: string }>(db, `SELECT c.id FROM categories c WHERE lower(c.name) = lower(?) AND ${VISIBLE_CATEGORY} LIMIT 1`, [given, userId]);
      if (!row) throw new QueryUserError(`There is no category named "${given.slice(0, 60)}". Call resolve_entities to find the right name or id.`);
      categoryId = row.id;
    }
  }
  const payeeKey = p.payee ? normalizeCounterparty(p.payee) || null : null;
  if (p.payee && !payeeKey) throw new QueryUserError('The payee contains no letters or digits. Call resolve_entities to find the payee key.');

  const w = where(userId, p, { type: p.type === 'both' ? null : p.type, categoryId, payeeKey, minCents: p.minCents, maxCents: p.maxCents });
  const header = { metric: p.metric, group_by: p.groupBy };

  if (p.groupBy === 'none') {
    const row = await first<{ s: number; n: number; p: number }>(
      db,
      `SELECT COALESCE(SUM(t.amount), 0) AS s, COUNT(*) AS n, COUNT(DISTINCT t.payee_key) AS p FROM transactions t WHERE ${w.sql}`,
      w.params,
    );
    const acc: AggAcc = { sum: row?.s ?? 0, n: row?.n ?? 0, payees: row?.p ?? 0 };
    return { ...header, groups: 1, rows: [{ group: 'all', value: aggOut(p.metric, aggValue(p.metric, acc)), count: acc.n }] };
  }

  if (p.groupBy === 'weekday' || p.groupBy === 'month') {
    const rows = await all<{ amount: number; payee_key: string; transaction_at: string }>(
      db,
      `SELECT t.amount, t.payee_key, t.transaction_at FROM transactions t WHERE ${w.sql} LIMIT ${AGG_SCAN_LIMIT + 1}`,
      w.params,
    );
    const capped = rows.length > AGG_SCAN_LIMIT;
    const buckets = new Map<string, { acc: AggAcc; keys: Set<string>; order: number }>();
    for (const r of rows.slice(0, AGG_SCAN_LIMIT)) {
      const day = localDate(p.tz, Date.parse(r.transaction_at));
      const label = p.groupBy === 'weekday' ? weekdayName(day) : dateKey(day).slice(0, 7);
      // Monday first for weekdays, chronological for months.
      const order = p.groupBy === 'weekday' ? (new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay() + 6) % 7 : day.year * 12 + day.month;
      const b = buckets.get(label) ?? { acc: { sum: 0, n: 0, payees: 0 }, keys: new Set<string>(), order };
      b.acc.sum += r.amount;
      b.acc.n += 1;
      b.keys.add(r.payee_key);
      buckets.set(label, b);
    }
    const out = [...buckets].map(([group, b]) => ({ group, order: b.order, value: aggValue(p.metric, { ...b.acc, payees: b.keys.size }), count: b.acc.n }));
    // Weekdays are ranked (the usual question is "which day is the most"), months run in time order.
    out.sort(p.groupBy === 'weekday' ? (x, y) => y.value - x.value || x.order - y.order : (x, y) => x.order - y.order);
    return {
      ...header,
      groups: out.length,
      rows: out.slice(0, 40).map((r) => ({ group: r.group, value: aggOut(p.metric, r.value), count: r.count })),
      ...(capped ? { scan_capped: true } : {}),
    };
  }

  // category / payee: grouped in SQL, ranked by the metric, bounded.
  const byCategory = p.groupBy === 'category';
  const key = byCategory ? 't.category_id' : 't.payee_key';
  const nameColumns = byCategory ? `COALESCE(c.name, 'Uncategorized') AS cname` : PAYEE_NAME_COLUMNS;
  const join = byCategory ? `LEFT JOIN categories c ON c.id = t.category_id AND ${VISIBLE_CATEGORY}` : '';
  const joinParams: SqlParam[] = byCategory ? [userId] : [];
  const nameOf = byCategory ? `COALESCE(c.name, '')` : 't.payee_key';
  const [groupRows, countRows] = await batch<Record<string, unknown>>(db, [
    db
      .prepare(
        `SELECT ${key} AS id, ${nameColumns}, SUM(t.amount) AS s, COUNT(*) AS n, COUNT(DISTINCT t.payee_key) AS p
         FROM transactions t ${join} WHERE ${w.sql}
         GROUP BY ${key} ORDER BY ${AGG_RANK[p.metric]} DESC, COUNT(*) DESC, ${nameOf}, ${key} LIMIT ${AGG_MAX_ROWS}`,
      )
      .bind(...joinParams, ...w.params),
    db.prepare(`SELECT COUNT(*) AS groups FROM (SELECT 1 FROM transactions t WHERE ${w.sql} GROUP BY ${key})`).bind(...w.params),
  ]);
  const groups = Number(countRows?.[0]?.['groups'] ?? 0);
  return {
    ...header,
    groups,
    rows: (groupRows ?? []).map((r) => ({
      group: byCategory ? String(r['cname']) : payeeName(r as unknown as NamedGroup),
      ...(typeof r['id'] === 'string' ? { id: r['id'] } : {}),
      value: aggOut(p.metric, aggValue(p.metric, { sum: Number(r['s']), n: Number(r['n']), payees: Number(r['p']) })),
      count: Number(r['n']),
    })),
    ...(groups > AGG_MAX_ROWS ? { truncated: true } : {}),
  };
}

/* ----------------------------------------------------------------------------------------------
 * Execution
 * -------------------------------------------------------------------------------------------- */

export const defaultQueries: AgentQueries = {
  resolve_entities: resolveEntities,
  spending_summary: spendingSummary,
  category_breakdown: categoryBreakdown,
  top_payees: topPayees,
  daily_cashflow: dailyCashflow,
  compare_periods: comparePeriods,
  budget_status: budgetStatus,
  list_transactions: listTransactions,
  aggregate_transactions: aggregateTransactions,
};

export type QueryResult = { ok: true; value: unknown } | { ok: false; error: string };

/** What the model is told when a call fails. */
function describeError(err: unknown): string {
  if (err instanceof QueryUserError) return err.message;
  log.warn('agent_tool_query_failed', { error: (err instanceof Error ? err.message : String(err)).slice(0, 300) });
  return 'The query failed. Check the arguments or try another approach.';
}

/**
 * Runs the independent calls of ONE agent step in parallel. Results come back in call order; a failing
 * call reports its own error and never hides the others.
 */
export async function executeQueries(
  queries: AgentQueries,
  db: Db,
  userId: string,
  calls: readonly QueryCall[],
): Promise<{ results: QueryResult[]; ms: number }> {
  const started = Date.now();
  const run = (call: QueryCall): Promise<unknown> => (queries[call.name] as (db: Db, userId: string, params: unknown) => Promise<unknown>)(db, userId, call.params);
  const settled = await Promise.allSettled(calls.map(run));
  const results = settled.map((s): QueryResult => (s.status === 'fulfilled' ? { ok: true, value: s.value } : { ok: false, error: describeError(s.reason) }));
  return { results, ms: Date.now() - started };
}
