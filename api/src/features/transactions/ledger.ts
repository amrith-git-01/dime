import { all } from '../../core/db';
import type { Db, SqlParam } from '../../core/db';
import { IST, addDays, startOfLocalDay } from '../../core/timezone';
import type { IsoRange } from '../../core/timezone';
import { parseDateKey } from '../recurring/schedule';
import type { DayTotals } from './aggregates';
import { toRow } from './repository';
import { LIST_COLUMNS } from './schemas';
import type { TransactionRow } from './schemas';

/**
 * THE definition of "spent" (docs/MONEY-MODEL-FIX-PLAN.md R2). Every aggregate in the app reads rows through `ledgerSelect`:
 * home, month summary, month insights, the insights roll-ups, top expenses, the budget alerts, the digest, the Broke Report
 * and the agent's `transactions` view. Nothing else may sum `transactions.amount`.
 *
 * `kind` is only what the user or the AI chose; linking never rewrites it. What a credit does is computed from its live links:
 * its linked part lowers the debit it is linked to and is not income; its unlinked remainder follows its own kind.
 *
 * Per live row (cents):
 *   effective_cents  amount minus the live links on it, never below 0 (a debit's real cost; a credit's UNLINKED part). Links are
 *                    capped by the service so the clamp only matters for a row edited below its links by an older client
 *   spend_cents      spend: effective_cents; payback: -effective_cents (an unlinked refund lowers spend in its own month and
 *                    category; a linked part already lowered the debit it pays back, in that debit's month); income, transfer: 0
 *   income_cents     income: effective_cents (Mom sends 5000, 3000 linked to the hotel bill: 2000 is income); payback, transfer: 0
 *   transfer_cents   transfer: amount
 *   payback_cents    spend: the part of it that is paid back; payback: its unlinked part (the spend reduction either way); income: 0
 *   is_fixed         the row has a recurring item OR its category's scope is not `spend`
 *   in_budget        counts toward the monthly budget: flexible rows, plus fixed rows whose recurring item opted in
 * Spend that is fixed and not in the budget is "committed" (rent, EMI, insurance).
 *
 * Offsets only count while BOTH sides are live (soft-deleting either one makes them inert, so a credit whose debit is deleted
 * falls back to its own kind's rule; restoring brings the links back).
 *
 * Spend never goes negative in a response (old app builds take the absolute value of the debit total): the aggregates below floor
 * at 0 here (`floored`): per category for a period (its total is the sum of its floored categories, so the breakdown reconciles) and
 * per day. A category with more unmatched refunds than spend shows 0.
 * Days and months are the stored `local_date` / `month_key`; the IST fallback is for rows the backfill has not reached yet.
 */

export interface LedgerSqlOptions {
  /** Table qualifier (`main.` inside the agent's CTE scope, where plain names are shadowed). */
  schema?: string;
  /** SQLite offset modifier used for rows without a `local_date` yet. */
  fallbackOffset?: string;
}

const IST_OFFSET_SQL = "'+330 minutes'";

/** `SELECT` of the ledger columns over the transactions that match `filter` (an SQL condition over alias `t`). */
export function ledgerSelect(filter: string, opts: LedgerSqlOptions = {}): string {
  const s = opts.schema ?? '';
  const off = opts.fallbackOffset ?? IST_OFFSET_SQL;
  return `SELECT e.*,
      CASE e.kind WHEN 'spend' THEN e.effective_cents WHEN 'payback' THEN -e.effective_cents ELSE 0 END AS spend_cents,
      CASE WHEN e.kind = 'income' THEN e.effective_cents ELSE 0 END AS income_cents,
      CASE WHEN e.kind = 'transfer' THEN e.amount_cents ELSE 0 END AS transfer_cents,
      CASE e.kind WHEN 'spend' THEN e.amount_cents - e.effective_cents WHEN 'payback' THEN e.effective_cents ELSE 0 END AS payback_cents,
      CASE WHEN e.is_fixed = 0 OR e.counts_budget = 1 THEN 1 ELSE 0 END AS in_budget
    FROM (
    SELECT b.*, MAX(0, b.amount_cents - b.offset_cents) AS effective_cents FROM (
      SELECT t.id AS id, t.user_id AS user_id, t.type AS type, t.kind AS kind, t.amount AS amount_cents,
        COALESCE(t.local_date, date(t.transaction_at, ${off})) AS local_date,
        COALESCE(t.month_key, strftime('%Y-%m', t.transaction_at, ${off})) AS month_key,
        t.category_id AS category_id, t.payee_key AS payee_key, t.counterparty_name AS counterparty_name,
        t.counterparty_type AS counterparty_type, t.detected_via AS detected_via, t.transaction_at AS transaction_at,
        t.recurring_item_id AS recurring_item_id,
        CASE
          WHEN t.kind = 'spend' THEN (SELECT COALESCE(SUM(o.amount), 0) FROM ${s}transaction_offsets o JOIN ${s}transactions p ON p.id = o.credit_id WHERE o.debit_id = t.id AND p.deleted_at IS NULL)
          WHEN t.kind IN ('income', 'payback') THEN (SELECT COALESCE(SUM(o.amount), 0) FROM ${s}transaction_offsets o JOIN ${s}transactions p ON p.id = o.debit_id WHERE o.credit_id = t.id AND p.deleted_at IS NULL)
          ELSE 0
        END AS offset_cents,
        CASE WHEN t.recurring_item_id IS NOT NULL OR COALESCE(c.scope, 'spend') <> 'spend' THEN 1 ELSE 0 END AS is_fixed,
        COALESCE(r.counts_toward_budget, 0) AS counts_budget
      FROM ${s}transactions t
      LEFT JOIN ${s}categories c ON c.id = t.category_id
      LEFT JOIN ${s}recurring_items r ON r.id = t.recurring_item_id
      WHERE ${filter}
    ) b
    ) e`;
}

/* ----------------------------------------------------------------------------------------------
 * Windows
 * -------------------------------------------------------------------------------------------- */

/** The rows an aggregate covers: local dates (inclusive `YYYY-MM-DD`, a month, a week) or UTC instants `[from, to)`. */
export type Window = { dates: { from: string; to: string } } | { instants: IsoRange };

/**
 * SQL (over alias `t`) and bound values for "the row is on one of these local dates (inclusive)". Two index-friendly arms: the rows
 * that have a local date (`transactions_user_local_date_idx`) and the rows the backfill has not reached yet, placed by their instant
 * in IST like the ledger's fallback (`transactions_user_at_idx`, then `local_date IS NULL`). A single `local_date ... OR local_date IS
 * NULL ...` condition made SQLite read every row of the user. `user` is the SQL for the owner's id (a bound `?` by default) and the
 * values it binds, repeated once per arm.
 */
export function datesCondition(dates: { from: string; to: string }, user: { sql: string; params: SqlParam[] } = { sql: '?', params: [] }): { sql: string; params: SqlParam[] } {
  const fromIso = new Date(startOfLocalDay(IST, parseDateKey(dates.from))).toISOString();
  const toIso = new Date(startOfLocalDay(IST, addDays(parseDateKey(dates.to), 1))).toISOString();
  const arm = (extra: string) => `SELECT w.id FROM transactions w WHERE w.user_id = ${user.sql} AND w.deleted_at IS NULL AND ${extra}`;
  return {
    sql: `t.id IN (${arm('w.local_date >= ? AND w.local_date <= ?')} UNION ALL ${arm('w.local_date IS NULL AND w.transaction_at >= ? AND w.transaction_at < ?')})`,
    params: [...user.params, dates.from, dates.to, ...user.params, fromIso, toIso],
  };
}

/** SQL (over alias `t`) and bound values selecting a user's live rows in a window. The user id is the first value. */
export function windowFilter(userId: string, window: Window): { sql: string; params: SqlParam[] } {
  if ('instants' in window) {
    return { sql: 't.user_id = ? AND t.deleted_at IS NULL AND t.transaction_at >= ? AND t.transaction_at < ?', params: [userId, window.instants.from, window.instants.to] };
  }
  const { sql, params } = datesCondition(window.dates, { sql: '?', params: [userId] });
  // `+` keeps SQLite from scanning the user's rows by user_id: the date arms below drive the query and `t` is looked up by id.
  return { sql: `+t.user_id = ? AND +t.deleted_at IS NULL AND ${sql}`, params: [userId, ...params] };
}

/** `WITH ledger AS (...)` for a user's window, with the values to bind first. */
function ledgerWith(userId: string, window: Window): { cte: string; params: SqlParam[] } {
  const { sql, params } = windowFilter(userId, window);
  return { cte: `WITH ledger AS (${ledgerSelect(sql)})`, params };
}

/* ----------------------------------------------------------------------------------------------
 * Aggregates
 * -------------------------------------------------------------------------------------------- */

export interface LedgerTotals {
  /** Spend, net of paybacks (fixed and flexible). */
  spendCents: number;
  fixedSpendCents: number;
  /** Everyday (non-fixed) spend, the sum of `flexSpendByCategory`. */
  flexSpendCents: number;
  /** Spend that counts toward the monthly budget. */
  budgetSpendCents: number;
  /** Fixed spend not counted in the budget. */
  committedCents: number;
  incomeCents: number;
  fixedIncomeCents: number;
  transferCents: number;
  paybackCents: number;
  /** Live rows of any kind. */
  count: number;
}

export interface PeriodLedger extends LedgerTotals {
  /** Spend cents by category id (every spend row, "" = uncategorized). */
  spendByCategory: Map<string, number>;
  /** Flexible spend by category: "where it went" (fixed money is shown as committed instead). */
  flexSpendByCategory: Map<string, number>;
  /** In-budget spend by category: what a category cap is measured against. */
  budgetSpendByCategory: Map<string, number>;
}

const add = (map: Map<string, number>, key: string, cents: number): void => void map.set(key, (map.get(key) ?? 0) + cents);

/** Spend never goes negative in a response: more unmatched refunds than spend shows 0 (see the header). Floors per category (periodLedger) and per day (dayTotals). */
const floored = (cents: number): number => Math.max(0, cents);
const flooredMap = (map: Map<string, number>): void => map.forEach((cents, key) => map.set(key, floored(cents)));

/** Everything a month (or any window) needs, from one grouped query. */
export async function periodLedger(db: Db, userId: string, window: Window): Promise<PeriodLedger> {
  const { cte, params } = ledgerWith(userId, window);
  const rows = await all<{ category_id: string | null; is_fixed: number; in_budget: number; spend: number; income: number; transfer: number; payback: number; n: number }>(
    db,
    `${cte}
     SELECT l.category_id AS category_id, l.is_fixed AS is_fixed, l.in_budget AS in_budget, SUM(l.spend_cents) AS spend,
            SUM(l.income_cents) AS income, SUM(l.transfer_cents) AS transfer, SUM(l.payback_cents) AS payback, COUNT(*) AS n
     FROM ledger l GROUP BY l.category_id, l.is_fixed, l.in_budget`,
    params,
  );
  const out: PeriodLedger = {
    spendCents: 0,
    fixedSpendCents: 0,
    flexSpendCents: 0,
    budgetSpendCents: 0,
    committedCents: 0,
    incomeCents: 0,
    fixedIncomeCents: 0,
    transferCents: 0,
    paybackCents: 0,
    count: 0,
    spendByCategory: new Map(),
    flexSpendByCategory: new Map(),
    budgetSpendByCategory: new Map(),
  };
  const fixed = new Map<string, number>();
  const committed = new Map<string, number>();
  for (const r of rows) {
    const key = r.category_id ?? '';
    out.count += r.n;
    out.incomeCents += r.income;
    out.transferCents += r.transfer;
    out.paybackCents += r.payback;
    if (r.is_fixed) {
      out.fixedIncomeCents += r.income;
      add(fixed, key, r.spend);
    } else {
      add(out.flexSpendByCategory, key, r.spend);
    }
    if (r.in_budget) add(out.budgetSpendByCategory, key, r.spend);
    else add(committed, key, r.spend);
    add(out.spendByCategory, key, r.spend);
  }
  // Floor each category once, then every total is the sum of its floored categories: the breakdown always reconciles with the
  // total (a category whose refunds exceed its spend shows 0 and takes nothing off another one). The totals' own identities
  // (spend = fixed + flexible = budget + committed) hold whenever no category is net-negative.
  for (const map of [out.spendByCategory, out.flexSpendByCategory, out.budgetSpendByCategory, fixed, committed]) flooredMap(map);
  const sum = (map: Map<string, number>): number => [...map.values()].reduce((a, b) => a + b, 0);
  out.spendCents = sum(out.spendByCategory);
  out.flexSpendCents = sum(out.flexSpendByCategory);
  out.budgetSpendCents = sum(out.budgetSpendByCategory);
  out.fixedSpendCents = sum(fixed);
  out.committedCents = sum(committed);
  return out;
}

/** Per local day totals (`credit` = income, `debit` = spend). Days without rows are absent. */
export async function dayTotals(db: Db, userId: string, window: Window): Promise<DayTotals[]> {
  const { cte, params } = ledgerWith(userId, window);
  const rows = await all<{ day: string; spend: number; fixed_spend: number; income: number; fixed_income: number; n: number }>(
    db,
    `${cte}
     SELECT l.local_date AS day, SUM(l.spend_cents) AS spend, SUM(CASE WHEN l.is_fixed = 1 THEN l.spend_cents ELSE 0 END) AS fixed_spend,
            SUM(l.income_cents) AS income, SUM(CASE WHEN l.is_fixed = 1 THEN l.income_cents ELSE 0 END) AS fixed_income, COUNT(*) AS n
     FROM ledger l GROUP BY l.local_date ORDER BY l.local_date`,
    params,
  );
  return rows.map((r) => ({
    day: r.day,
    creditCents: r.income,
    debitCents: floored(r.spend),
    fixedCreditCents: r.fixed_income,
    fixedDebitCents: floored(r.fixed_spend),
    count: r.n,
  }));
}

export interface PayeeRow {
  type: 'debit' | 'credit';
  payee_key: string;
  display_name: string;
  total_cents: number;
  count: number;
}

/**
 * Per (type, payee) totals and counts: flexible spend (net of paybacks) as `debit`, income as `credit`. `display_name` is the
 * name of the OLDEST row of the group that has a non-empty name ('Unknown' when none). Ordered by type, then total descending
 * (ties: most recent first). A payee whose paybacks cancel its spend is left out.
 */
export async function payeeTotals(db: Db, userId: string, window: Window): Promise<PayeeRow[]> {
  const { cte, params } = ledgerWith(userId, window);
  const rows = await all<{ type: 'debit' | 'credit'; payee_key: string; display_name: string; total: number; n: number }>(
    db,
    `${cte}, src AS (
       SELECT CASE WHEN l.kind = 'income' THEN 'credit' ELSE 'debit' END AS type, l.payee_key AS payee_key,
              CASE WHEN l.kind = 'income' THEN l.income_cents ELSE l.spend_cents END AS amount,
              CASE WHEN l.kind = 'payback' THEN 0 ELSE 1 END AS counted, l.transaction_at AS transaction_at,
              NULLIF(TRIM(l.counterparty_name), '') AS pname
       FROM ledger l
       WHERE l.kind = 'income' OR (l.kind IN ('spend', 'payback') AND l.is_fixed = 0)
     )
     SELECT type, payee_key,
            COALESCE((SELECT s2.pname FROM src s2
                      WHERE s2.type = src.type AND s2.payee_key = src.payee_key AND s2.pname IS NOT NULL
                      ORDER BY s2.transaction_at ASC LIMIT 1), 'Unknown') AS display_name,
            SUM(amount) AS total, SUM(counted) AS n
     FROM src
     GROUP BY type, payee_key
     HAVING SUM(amount) > 0
     ORDER BY type, total DESC, MAX(transaction_at) DESC, payee_key`,
    params,
  );
  return rows.map((r) => ({ type: r.type, payee_key: r.payee_key, display_name: r.display_name, total_cents: r.total, count: r.n }));
}

/** Largest single flexible spends in a window by what they really cost (net of paybacks); newest first on ties. */
export async function topSpends(db: Db, userId: string, window: Window, limit: number): Promise<(TransactionRow & { effective_cents: number })[]> {
  const { cte, params } = ledgerWith(userId, window);
  const rows = await all<TransactionRowDb & { effective_cents: number }>(
    db,
    `${cte}
     SELECT ${LIST_COLUMNS.split(',').map((c) => `t.${c}`).join(',')}, l.effective_cents AS effective_cents FROM ledger l JOIN transactions t ON t.id = l.id
     WHERE l.kind = 'spend' AND l.is_fixed = 0 AND l.effective_cents > 0
     ORDER BY l.effective_cents DESC, l.transaction_at DESC LIMIT ?`,
    [...params, limit],
  );
  return rows.map((r) => ({ ...toRow(r), effective_cents: r.effective_cents }));
}

type TransactionRowDb = Parameters<typeof toRow>[0];
