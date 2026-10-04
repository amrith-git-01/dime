import { addDays } from '../../core/timezone';
import { validateMiniChart } from './chart';
import { daysBetween, isoDate, parseIsoDate, wallIso } from './dates';
import { validateDeepLink } from './deep-link';
import type { ResolvedEntity } from './prepass';
import type { DeepLink, MiniChartBlock } from './schemas';
import type { ToolResult } from './template';

/**
 * Charts and the deep link are built from the tool results, never from model text: the numbers are
 * the database's, the ids can not be invented, and the answer can be streamed as plain prose. Both go
 * through the same schema validation the app contract defines.
 */

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : {});
const list = (v: unknown): Rec[] => (Array.isArray(v) ? v.map(rec) : []);
const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Jul 2026" for a whole calendar month, else "10 Jul – 20 Jul". */
function periodLabel(from: string, to: string): string {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (!a || !b) return `${from} – ${to}`;
  const month = (d: { year: number; month: number }) => `${MONTH_ABBR[d.month - 1] ?? ''} ${d.year}`;
  const lastDay = new Date(Date.UTC(b.year, b.month, 0)).getUTCDate();
  if (a.year === b.year && a.month === b.month && a.day === 1 && b.day === lastDay) return month(a);
  const short = (d: { month: number; day: number }) => `${d.day} ${MONTH_ABBR[d.month - 1] ?? ''}`;
  return `${short(a)} – ${short(b)}`;
}

function chartOf(result: ToolResult): MiniChartBlock | null {
  const data = result.data;
  if (!result.ok || !data) return null;
  const period = rec(data['period']);
  const from = str(period['from']);
  const to = str(period['to']);

  switch (result.name) {
    case 'category_breakdown': {
      const rows = list(data['categories']);
      const series = rows.map((r) => ({ name: str(r['name']), value: num(r['total']) })).filter((s) => s.value > 0);
      const other = rec(data['other']);
      if (series.length < 8 && num(other['total']) > 0) series.push({ name: 'Other', value: num(other['total']) });
      if (series.length < 2) return null;
      return validateMiniChart({ chart_kind: 'donut', payload: { title: data['type'] === 'credit' ? 'Income by category' : 'Spending by category', series } });
    }
    case 'top_payees': {
      const series = list(data['payees']).map((r) => ({ name: str(r['name']), value: num(r['total']) })).filter((s) => s.value > 0);
      if (series.length < 2) return null;
      return validateMiniChart({ chart_kind: 'donut', payload: { title: 'Top payees', series } });
    }
    case 'daily_cashflow': {
      const a = parseIsoDate(from);
      const b = parseIsoDate(to);
      if (!a || !b || num(data['debit_total']) <= 0) return null;
      const byDay = new Map(list(data['days']).map((d) => [str(d['date']), num(d['debit'])]));
      const points = Array.from({ length: daysBetween(a, b) + 1 }, (_, i) => {
        const date = isoDate(addDays(a, i));
        return { date, amount: byDay.get(date) ?? 0 };
      });
      return validateMiniChart({ chart_kind: 'cashflow', payload: { title: 'Daily spending', points } });
    }
    case 'compare_periods': {
      const pa = rec(data['period_a']);
      const pb = rec(data['period_b']);
      const labelA = periodLabel(str(pa['from']), str(pa['to']));
      const labelB = periodLabel(str(pb['from']), str(pb['to']));
      const rows = list(data['rows']);
      const compare_series =
        rows.length > 0
          ? rows.map((r) => ({ name: str(r['name']), period_a: num(r['a']), period_b: num(r['b']) }))
          : [
              { name: 'Spent', period_a: num(rec(data['a'])['debit']), period_b: num(rec(data['b'])['debit']) },
              { name: 'Income', period_a: num(rec(data['a'])['credit']), period_b: num(rec(data['b'])['credit']) },
            ];
      return validateMiniChart({
        chart_kind: 'compare_bar',
        payload: { title: `${labelA} vs ${labelB}`, period_a_label: labelA, period_b_label: labelB, compare_series },
      });
    }
    default:
      return null;
  }
}

export type AgentBlock = Record<string, unknown>;
/** At most this many blocks per answer. */
export const MAX_BLOCKS = 4;
const MAX_CATEGORY_ROWS = 3;
const MAX_TX_ROWS = 5;

const dateKeys = (from: string, to: string): string[] => {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  return a && b ? Array.from({ length: daysBetween(a, b) + 1 }, (_, i) => isoDate(addDays(a, i))) : [];
};

/** One side of a compare_months card: daily cashflow for a month, monthly for a year, plus the top payees. */
function comparePeriod(kind: 'month' | 'year', summary: Rec, period: Rec, days: unknown, payees: unknown) {
  const byDay = new Map(list(days).map((d) => [str(d['date']), d]));
  let cashflow: { date: string; expense: number; income: number }[];
  if (kind === 'month') {
    cashflow = dateKeys(str(period['from']), str(period['to'])).map((date) => ({ date, expense: num(byDay.get(date)?.['debit']), income: num(byDay.get(date)?.['credit']) }));
  } else {
    const end = parseIsoDate(str(period['to']));
    const year = parseIsoDate(str(period['from']))?.year ?? 0;
    cashflow = Array.from({ length: end?.month ?? 0 }, (_, i) => {
      const prefix = `${year}-${String(i + 1).padStart(2, '0')}-`;
      const rows = [...byDay.entries()].filter(([date]) => date.startsWith(prefix)).map(([, d]) => d);
      return { date: `${prefix}01`, expense: rows.reduce((t, d) => t + num(d['debit']), 0), income: rows.reduce((t, d) => t + num(d['credit']), 0) };
    });
  }
  return {
    spent: num(summary['debit']),
    income: num(summary['credit']),
    net: num(summary['net']),
    cashflow,
    // `share` is a fraction (0..1) in the app's insights payloads; the SQL tool reports percent.
    payees: list(payees).map((p) => ({ name: str(p['name']), amount: num(p['total']), share: Math.round(num(p['share']) * 100) / 10_000 })),
  };
}

/** The card the app draws for "this month vs last month" / "2026 vs 2025" (shape of the former insights-based block). */
function compareMonthsOf(result: ToolResult): AgentBlock | null {
  const d = result.blockData;
  if (!result.ok || !d) return null;
  const kind = d['kind'] === 'year' ? 'year' : 'month';
  const periods = rec(d['periods']);
  const pa = rec(periods['a']);
  const pb = rec(periods['b']);
  const label = (p: Rec): string => {
    if (kind === 'month') return periodLabel(str(p['from']), str(p['to']));
    const year = parseIsoDate(str(p['from']))?.year;
    return str(p['to']).endsWith('-12-31') ? String(year) : `${year} (YTD)`;
  };
  return {
    type: 'compare_months',
    ...(kind === 'year' ? { chart_label: 'Monthly Spend' } : {}),
    period_a_label: label(pa),
    period_b_label: label(pb),
    period_a: comparePeriod(kind, rec(d['a']), pa, d['a_days'], d['a_payees']),
    period_b: comparePeriod(kind, rec(d['b']), pb, d['b_days'], d['b_payees']),
  };
}

function metricsOf(result: ToolResult): AgentBlock[] {
  const data = result.data;
  if (!result.ok || !data || num(data['count']) === 0) return [];
  const scoped = Boolean(result.args['category_id'] || result.args['payee_key']);
  const count = (n: unknown, noun: string) => `${num(n)} ${noun}${num(n) === 1 ? '' : 's'}`;
  const metrics: AgentBlock[] = [{ type: 'metric', label: 'Spent', value: str(data['debit_display']), delta: count(data['debit_count'], 'transaction') }];
  if (!scoped) {
    if (num(data['credit_count']) > 0) metrics.push({ type: 'metric', label: 'Income', value: str(data['credit_display']), delta: count(data['credit_count'], 'transaction') });
    metrics.push({ type: 'metric', label: 'Net', value: str(data['net_display']), delta: null });
  }
  return metrics;
}

function categoryRowsOf(result: ToolResult): AgentBlock[] {
  if (!result.ok || !result.data) return [];
  return list(result.data['categories'])
    .filter((c) => str(c['total_display']) !== '')
    .slice(0, MAX_CATEGORY_ROWS)
    .map((c) => ({ type: 'category_row', name: str(c['name']), amount: str(c['total_display']), pct: num(c['share']) }));
}

function txPreviewOf(result: ToolResult): AgentBlock[] {
  if (!result.ok || !result.data) return [];
  const rows = list(result.data['rows']);
  if (rows.length === 0) return [];
  return [
    {
      type: 'tx_preview',
      // Only these fields; a note never reaches the app.
      rows: rows.slice(0, MAX_TX_ROWS).map((r) => ({ date: str(r['date']), counterparty_name: str(r['payee']), amount: str(r['amount_display']), type: str(r['type']), category: str(r['category']) })),
      total_count: num(result.data['total_count']),
    },
  ];
}

/** App blocks of one tool result, in display order. */
function blocksOf(result: ToolResult): AgentBlock[] {
  switch (result.name) {
    case 'compare_periods': {
      const card = compareMonthsOf(result);
      if (card) return [card];
      const chart = chartOf(result);
      return chart ? [chart as unknown as AgentBlock] : [];
    }
    case 'spending_summary':
      return metricsOf(result);
    case 'category_breakdown': {
      const chart = chartOf(result);
      return [...(chart ? [chart as unknown as AgentBlock] : []), ...categoryRowsOf(result)];
    }
    case 'list_transactions':
      return txPreviewOf(result);
    default: {
      const chart = chartOf(result);
      return chart ? [chart as unknown as AgentBlock] : [];
    }
  }
}

/**
 * Blocks for the app, built from tool results only: newest tool first (most relevant to the answer), one
 * set per tool, at most one chart and at most MAX_BLOCKS in all.
 */
export function buildBlocks(results: readonly ToolResult[]): AgentBlock[] {
  const out: AgentBlock[] = [];
  const seen = new Set<string>();
  let charted = false;
  for (let i = results.length - 1; i >= 0 && out.length < MAX_BLOCKS; i--) {
    const r = results[i];
    if (!r || seen.has(r.name)) continue;
    let blocks = blocksOf(r);
    if (blocks.length === 0) continue;
    seen.add(r.name);
    if (charted) blocks = blocks.filter((b) => b['type'] !== 'mini_chart');
    if (blocks.some((b) => b['type'] === 'mini_chart')) charted = true;
    out.push(...blocks.slice(0, MAX_BLOCKS - out.length));
  }
  return out;
}

/** Names the turn learned for ids (from the pre-pass and from tool results). */
export function collectEntityNames(results: readonly ToolResult[], prepass: readonly ResolvedEntity[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const e of prepass) names.set(`${e.type}:${e.id}`, e.name);
  for (const r of results) {
    if (!r.ok || !r.data) continue;
    for (const m of list(r.data['matches'])) if (str(m['id'])) names.set(`${str(m['type'])}:${str(m['id'])}`, str(m['name']));
    for (const c of list(r.data['categories'])) if (str(c['category_id'])) names.set(`category:${str(c['category_id'])}`, str(c['name']));
    for (const p of list(r.data['payees'])) if (str(p['payee_key'])) names.set(`payee:${str(p['payee_key'])}`, str(p['name']));
  }
  return names;
}

const LINK_TOOLS: ReadonlySet<string> = new Set(['spending_summary', 'top_payees', 'list_transactions']);

/**
 * A TransactionsList deep link for the last tool call that was scoped to exactly one payee or category
 * (or to one single day), with the names the turn already knows. Null when there is nothing precise to open.
 */
export function buildDeepLink(results: readonly ToolResult[], names: ReadonlyMap<string, string>, tz: string): DeepLink | null {
  const topPayeeKeys = results.flatMap((r) => (r.ok && r.name === 'top_payees' ? list(r.data?.['payees']).map((p) => str(p['payee_key'])).filter(Boolean) : []));
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i];
    if (!r?.ok || !LINK_TOOLS.has(r.name)) continue;
    const from = str(r.args['from']);
    const to = str(r.args['to']);
    const a = parseIsoDate(from);
    const b = parseIsoDate(to);
    if (!a || !b) continue;
    const common = { year: b.year, monthIndex0: b.month - 1 };
    const range = { fromIso: wallIso(tz, a, 0, 0, 0), toIso: wallIso(tz, b, 23, 59, 59, 999_999) };

    const payeeKey = str(r.args['payee_key']);
    const categoryId = str(r.args['category_id']);
    let link: unknown = null;
    if (payeeKey) {
      const name = names.get(`payee:${payeeKey}`);
      if (name) link = { screen: 'TransactionsList', label: `View ${name}`, params: { filter: 'payee', ...common, payeeId: payeeKey, payeeKey, payeeDisplayName: name, payeeKeysTop: topPayeeKeys.length > 0 ? [...topPayeeKeys] : [payeeKey], ...range } };
    } else if (categoryId) {
      const name = names.get(`category:${categoryId}`);
      if (name) link = { screen: 'TransactionsList', label: `View ${name}`, params: { filter: 'category', ...common, categoryId, categoryDisplayName: name, ...range } };
    } else if (r.name === 'list_transactions' && from === to) {
      link = { screen: 'TransactionsList', label: 'View this day', params: { filter: 'day', ...common, dayKey: from } };
    }
    const valid = validateDeepLink(link);
    if (valid) return valid;
  }
  return null;
}
