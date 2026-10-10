import * as z from 'zod';

import type { LocalDate } from '../../core/timezone';
import { daysBetween, daysInMonth, isoDate, parseIsoDate, today, toInstantRange } from './dates';
import type { InstantRange } from './dates';
import type { ToolSpec } from './llm';
import { withMoneyDisplay } from './money';
import type { QueryCall } from './queries';

/**
 * The agent's tools. Each one is a zod schema (the single source of truth: the JSON Schema sent to the
 * model is generated from it and the model's arguments are validated with it), a planner that turns
 * validated arguments into ONE query call (`queries.ts`, D1 prepared statements that always bind the
 * user id), and a shaper that makes the query's document compact and adds the `<money>_display` twins.
 *
 * Date arguments are INCLUSIVE local dates (`YYYY-MM-DD`, the user's timezone). The queries are always
 * called with the half-open UTC instants `[from 00:00, to + 1 day 00:00)`.
 */

export const TOOL_NAMES = [
  'resolve_entities',
  'spending_summary',
  'category_breakdown',
  'top_payees',
  'daily_cashflow',
  'compare_periods',
  'budget_status',
  'list_transactions',
  'aggregate_transactions',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** A tool call that could not be run as asked; the message goes back to the model as the tool result. */
export class ToolArgError extends Error {
  override name = 'ToolArgError';
}

export interface ToolContext {
  tz: string;
  nowMs: number;
}

export interface ToolOutput {
  /** What the model sees (compact, money with display twins). */
  data: Record<string, unknown>;
  /** Result size for logs (rows, categories, matches...). */
  rows: number;
  /** Extra raw data for app blocks (e.g. compare_months). Not sent to the model. */
  blockData?: Record<string, unknown>;
}

export interface Prepared {
  call: QueryCall;
  /** Additional calls run in the same step; their results reach `shape` (and never the model). */
  extra?: QueryCall[];
  args: Record<string, unknown>;
  shape: (raw: unknown, extra: readonly unknown[]) => ToolOutput;
}

export interface AgentTool {
  name: ToolName;
  /** Progress label of the SSE `step` event. */
  label: string;
  spec: ToolSpec;
  /** Validates the model's raw JSON arguments. Throws `ToolArgError` with a message the model can act on. */
  prepare: (rawArguments: string, ctx: ToolContext) => Prepared;
}

/* ----------------------------------------------------------------------------------------------
 * Argument schemas
 * -------------------------------------------------------------------------------------------- */

const MAX_RANGE_DAYS = 1100;
export const MAX_DAILY_DAYS = 40;

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'use the format YYYY-MM-DD')
  .refine((d) => parseIsoDate(d) !== null, 'not a real calendar date');
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'must be a category id (uuid) from resolve_entities or a previous result');
const range = {
  from: isoDay.describe('First day, inclusive, local date YYYY-MM-DD'),
  to: isoDay.describe('Last day, INCLUSIVE, local date YYYY-MM-DD (the whole last day is counted)'),
};
const categoryId = uuid.optional().describe('Only this category (uuid from resolve_entities or category_breakdown)');
const payeeKey = z.string().min(1).max(120).optional().describe('Only this payee (payee key from resolve_entities or top_payees)');
const period = z.object({ from: range.from, to: range.to });

const schemas = {
  resolve_entities: z.object({
    text: z.string().min(2).max(80).describe('A payee or category name as the user wrote it (typos are fine)'),
  }),
  spending_summary: z.object({ ...range, category_id: categoryId, payee_key: payeeKey }),
  category_breakdown: z.object({ ...range, type: z.enum(['debit', 'credit']).default('debit').describe('debit = spending (default), credit = income') }),
  top_payees: z.object({
    ...range,
    category_id: categoryId,
    limit: z.number().int().min(1).max(10).default(5).describe('How many payees, at most 10'),
  }),
  daily_cashflow: z.object({ ...range }),
  compare_periods: z.object({
    a: period.describe('The newer / primary period'),
    b: period.describe('The baseline period it is compared with'),
    by: z.enum(['total', 'category', 'payee']).default('total').describe('total (default), or per category / per payee for spending'),
  }),
  budget_status: z.object({
    period: z.literal('month').default('month'),
    at: isoDay.optional().describe('Any local date inside the wanted month (default: today)'),
  }),
  list_transactions: z.object({
    ...range,
    category_id: categoryId,
    payee_key: payeeKey,
    min_amount: z.number().positive().optional().describe('Only amounts at or above this many rupees'),
    type: z.enum(['debit', 'credit']).optional().describe('debit = spending, credit = income (default: both)'),
    limit: z.number().int().min(1).max(20).default(10).describe('How many rows, at most 20'),
    order: z.enum(['date_desc', 'date_asc', 'amount_desc', 'amount_asc']).default('date_desc'),
  }),
  aggregate_transactions: z.object({
    ...range,
    metric: z.enum(['sum', 'avg', 'count', 'count_distinct_payees']).describe('sum = total amount, avg = average amount per transaction, count = number of transactions, count_distinct_payees = number of different payees'),
    group_by: z.enum(['none', 'weekday', 'month', 'category', 'payee']).default('none').describe('none = one number for the whole period (default); weekday = Monday..Sunday; month = calendar months; category; payee'),
    type: z.enum(['debit', 'credit', 'both']).default('debit').describe('debit = spending (default), credit = income, both'),
    category: z.string().min(1).max(80).optional().describe('Only this category: its id (uuid) or its exact name'),
    payee: z.string().min(1).max(120).optional().describe('Only this payee: its payee_key from resolve_entities or top_payees'),
    min_amount: z.number().min(0).optional().describe('Only amounts at or above this many rupees'),
    max_amount: z.number().min(0).optional().describe('Only amounts at or below this many rupees. For "under ₹200" use 199.99'),
  }),
} satisfies Record<ToolName, z.ZodType>;

/* ----------------------------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------------------------- */

const MONEY_KEYS: ReadonlySet<string> = new Set([
  'debit',
  'credit',
  'net',
  'total',
  'a',
  'b',
  'delta',
  'amount',
  'budget',
  'spent',
  'remaining',
  'total_spent',
  'debit_total',
  'credit_total',
  'daily_budget',
]);
const SKIP_DISPLAY: ReadonlySet<string> = new Set(['days']);
const VALUE_KEY: ReadonlySet<string> = new Set(['value']);

const money = (raw: unknown): Record<string, unknown> => withMoneyDisplay(raw, MONEY_KEYS, SKIP_DISPLAY) as Record<string, unknown>;
const obj = (raw: unknown): Record<string, unknown> => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});
const len = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

function day(value: string): LocalDate {
  const d = parseIsoDate(value);
  if (!d) throw new ToolArgError(`${value} is not a real calendar date (use YYYY-MM-DD).`);
  return d;
}

/** Validates an inclusive `[from, to]` and converts it to the half-open instants the SQL functions take. */
function instants(tz: string, from: string, to: string, maxDays = MAX_RANGE_DAYS): InstantRange {
  const a = day(from);
  const b = day(to);
  const days = daysBetween(a, b) + 1;
  if (days < 1) throw new ToolArgError(`"to" (${to}) is before "from" (${from}). Both dates are inclusive and "from" must not be after "to".`);
  if (days > maxDays) {
    throw new ToolArgError(
      maxDays === MAX_DAILY_DAYS
        ? `daily_cashflow supports at most ${MAX_DAILY_DAYS} days; ${from} to ${to} is ${days}. Use a shorter range, or category_breakdown / spending_summary for a long period.`
        : `The range ${from} to ${to} is ${days} days; the maximum is ${maxDays}.`,
    );
  }
  return toInstantRange(tz, a, b);
}

function monthOf(tz: string, at: string | undefined, nowMs: number): { from: LocalDate; to: LocalDate } {
  const ref = at ? day(at) : today(tz, nowMs);
  return { from: { ...ref, day: 1 }, to: { ...ref, day: daysInMonth(ref.year, ref.month) } };
}

/** Rupees (a JSON number) to whole cents, rounded the way the user means a bound: up for a minimum, down for a maximum. */
const toCentsCeil = (rupees: number): number => Math.ceil(Math.round(rupees * 1e6) / 1e4);
const toCentsFloor = (rupees: number): number => Math.floor(Math.round(rupees * 1e6) / 1e4);

/** Parse and validate the model's JSON arguments with a tool's schema. */
function parseArgs<S extends z.ZodType>(schema: S, raw: string): z.output<S> {
  let json: unknown;
  try {
    json = raw.trim() === '' ? {} : JSON.parse(raw);
  } catch {
    throw new ToolArgError('The arguments are not valid JSON. Send a JSON object.');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.length > 0 ? i.path.join('.') : 'arguments'}: ${i.message}`);
    throw new ToolArgError(`Invalid arguments. ${issues.slice(0, 4).join('; ')}`);
  }
  return parsed.data;
}

function toSpec(name: ToolName, description: string): ToolSpec {
  const { $schema: _ignored, ...parameters } = z.toJSONSchema(schemas[name], { io: 'input', target: 'draft-7' }) as Record<string, unknown>;
  return { type: 'function', function: { name, description, parameters } };
}

const period_ = (from: string, to: string) => ({ from, to });

/** `month` when both periods are whole calendar months, `year` when both start on 1 January of one year (full or year to date). */
function comparePairKind(a: { from: string; to: string }, b: { from: string; to: string }): 'month' | 'year' | null {
  const whole = (p: { from: string; to: string }, kind: 'month' | 'year'): boolean => {
    const f = parseIsoDate(p.from);
    const t = parseIsoDate(p.to);
    if (!f || !t || f.year !== t.year) return false;
    if (kind === 'year') return f.month === 1 && f.day === 1;
    return f.month === t.month && f.day === 1 && t.day === daysInMonth(t.year, t.month);
  };
  if (whole(a, 'month') && whole(b, 'month')) return 'month';
  if (whole(a, 'year') && whole(b, 'year')) return 'year';
  return null;
}

/* ----------------------------------------------------------------------------------------------
 * resolve_entities (also used by the pre-pass)
 * -------------------------------------------------------------------------------------------- */

export interface EntityMatch {
  phrase: string;
  type: 'payee' | 'category';
  /** payee key, or category uuid. */
  id: string;
  name: string;
  /** word_similarity: how well the phrase appears inside the name. */
  score: number;
  /** similarity: closeness of the whole strings (1 = the same name). */
  similarity: number;
  txnCount: number;
}

export function resolveEntitiesCall(phrases: readonly string[]): QueryCall {
  return { name: 'resolve_entities', params: { phrases } };
}

export function parseEntityMatches(raw: unknown): EntityMatch[] {
  const matches = obj(raw)['matches'];
  if (!Array.isArray(matches)) return [];
  const out: EntityMatch[] = [];
  for (const item of matches) {
    const m = obj(item);
    if ((m['type'] !== 'payee' && m['type'] !== 'category') || typeof m['id'] !== 'string' || typeof m['name'] !== 'string') continue;
    out.push({
      phrase: typeof m['phrase'] === 'string' ? m['phrase'] : '',
      type: m['type'],
      id: m['id'],
      name: m['name'],
      score: Number(m['score']) || 0,
      similarity: Number(m['similarity']) || 0,
      txnCount: Number(m['txn_count']) || 0,
    });
  }
  return out;
}

/** Exact name matches rank first, then by score; one row per entity, at most 5. */
function shapeEntities(raw: unknown): ToolOutput {
  const best = new Map<string, EntityMatch>();
  for (const m of parseEntityMatches(raw)) {
    const key = `${m.type}:${m.id}`;
    const cur = best.get(key);
    if (!cur || m.score > cur.score) best.set(key, m);
  }
  const matches = [...best.values()]
    .sort((x, y) => y.score - x.score || y.similarity - x.similarity)
    .slice(0, 5)
    .map((m) => ({ type: m.type, id: m.id, name: m.name, score: m.score, exact: m.similarity >= 0.95, ...(m.type === 'payee' ? { txn_count: m.txnCount } : {}) }));
  return { data: { matches }, rows: matches.length };
}

/** One tool definition: spec text + schema-driven preparation. */
function define<N extends ToolName>(
  name: N,
  label: string,
  description: string,
  prepare: (args: z.output<(typeof schemas)[N]>, ctx: ToolContext) => Prepared,
): AgentTool {
  const schema = schemas[name] as unknown as z.ZodType<z.output<(typeof schemas)[N]>>;
  return {
    name,
    label,
    spec: toSpec(name, description),
    prepare: (raw, ctx) => prepare(parseArgs(schema, raw), ctx),
  };
}

/* ----------------------------------------------------------------------------------------------
 * The tools
 * -------------------------------------------------------------------------------------------- */

export const TOOLS: readonly AgentTool[] = [
  define(
    'resolve_entities',
    'Looking up payees and categories',
    'Fuzzy-match a payee (merchant or person) or a category name to its id. Returns up to 5 matches with a score (1 = perfect) and exact=true when the name is identical. Use it when you need a payee_key or category_id that was not already resolved for you.',
    (args) => ({
      call: resolveEntitiesCall([args.text]),
      args,
      shape: shapeEntities,
    }),
  ),

  define(
    'spending_summary',
    'Totalling your spending',
    'Totals for a period: debit (spending), credit (income), net (credit minus debit) and transaction counts. Optionally only one category and/or one payee. The default tool for "how much did I spend / earn".',
    (args, ctx) => {
      const r = instants(ctx.tz, args.from, args.to);
      return {
        call: { name: 'spending_summary', params: { ...r, categoryId: args.category_id ?? null, payeeKey: args.payee_key ?? null } },
        args,
        shape: (raw) => ({ data: { period: period_(args.from, args.to), ...money(raw) }, rows: Number(obj(raw)['count']) || 0 }),
      };
    },
  ),

  define(
    'category_breakdown',
    'Breaking down your spending by category',
    'Per-category totals for a period: top 8 categories with total, count and share (percent), plus an "other" bucket. type debit = spending (default) or credit = income. Use it for "where did my money go", "top category", or a category share.',
    (args, ctx) => {
      const r = instants(ctx.tz, args.from, args.to);
      return {
        call: { name: 'category_breakdown', params: { ...r, type: args.type } },
        args,
        shape: (raw) => ({ data: { period: period_(args.from, args.to), ...money(raw) }, rows: len(obj(raw)['categories']) }),
      };
    },
  ),

  define(
    'top_payees',
    'Finding your top payees',
    'Top payees by spending for a period (at most 10), each with payee_key, total, count and share. Optionally inside one category. Use it for "who did I pay the most".',
    (args, ctx) => {
      const r = instants(ctx.tz, args.from, args.to);
      return {
        call: { name: 'top_payees', params: { ...r, categoryId: args.category_id ?? null, limit: args.limit } },
        args,
        shape: (raw) => ({ data: { period: period_(args.from, args.to), ...money(raw) }, rows: len(obj(raw)['payees']) }),
      };
    },
  ),

  define(
    'daily_cashflow',
    'Charting your day-by-day cashflow',
    `Per-day debit and credit totals for a period of at most ${MAX_DAILY_DAYS} days (days without transactions are omitted), the range totals and the biggest spending day. Use it for daily patterns, "which day did I spend the most", or a daily chart.`,
    (args, ctx) => {
      const r = instants(ctx.tz, args.from, args.to, MAX_DAILY_DAYS);
      return {
        call: { name: 'daily_cashflow', params: { ...r, tz: ctx.tz } },
        args,
        shape: (raw) => ({ data: { period: period_(args.from, args.to), ...money(raw) }, rows: len(obj(raw)['days']) }),
      };
    },
  ),

  define(
    'compare_periods',
    'Comparing the two periods',
    'Compare two periods A (newer) and B (baseline): totals with delta and percent change; by=category or by=payee adds per-item spending for both (top 8 plus other). Use it for "this month vs last month", "did I spend more in July than June" and similar.',
    (args, ctx) => {
      const a = instants(ctx.tz, args.a.from, args.a.to);
      const b = instants(ctx.tz, args.b.from, args.b.to);
      const kind = comparePairKind(args.a, args.b);
      // Whole months / years: the app draws a compare_months card, which needs per-period cashflow and payees.
      const extra: QueryCall[] | undefined = kind
        ? [
            ...[a, b].map((r): QueryCall => ({ name: 'daily_cashflow', params: { ...r, tz: ctx.tz } })),
            ...[a, b].map((r): QueryCall => ({ name: 'top_payees', params: { ...r, categoryId: null, limit: 5 } })),
          ]
        : undefined;
      return {
        call: { name: 'compare_periods', params: { a, b, by: args.by } },
        extra,
        args,
        shape: (raw, more) => {
          const rows = len(obj(raw)['rows']);
          const blockData =
            kind && more.length === 4
              ? { kind, a: obj(raw)['a'], b: obj(raw)['b'], periods: { a: args.a, b: args.b }, a_days: obj(more[0])['days'], b_days: obj(more[1])['days'], a_payees: obj(more[2])['payees'], b_payees: obj(more[3])['payees'] }
              : undefined;
          return {
            data: { period_a: period_(args.a.from, args.a.to), period_b: period_(args.b.from, args.b.to), ...money(raw) },
            rows: rows || 1,
            ...(blockData ? { blockData } : {}),
          };
        },
      };
    },
  ),

  define(
    'budget_status',
    'Checking your budgets',
    'The monthly budget and the category budgets against spending in a calendar month: budget, spent, remaining (negative when over), pct_used and an over flag. The month is the one containing `at` (default: today).',
    (args, ctx) => {
      const month = monthOf(ctx.tz, args.at, ctx.nowMs);
      const r = toInstantRange(ctx.tz, month.from, month.to);
      return {
        call: { name: 'budget_status', params: r },
        args: { ...args, from: isoDate(month.from), to: isoDate(month.to) },
        shape: (raw) => ({
          data: { period: period_(isoDate(month.from), isoDate(month.to)), ...money(raw) },
          rows: len(obj(raw)['categories']) + (obj(raw)['monthly'] ? 1 : 0),
        }),
      };
    },
  ),

  define(
    'list_transactions',
    'Pulling up matching transactions',
    'Specific transactions (at most 20) with only: local date, amount, type, payee name and category. Filter by period, category, payee, minimum amount and type; sort by date or amount. Notes are never returned. Use it for "my biggest purchases", "show my Swiggy orders", "expenses over X".',
    (args, ctx) => {
      const r = instants(ctx.tz, args.from, args.to);
      return {
        call: {
          name: 'list_transactions',
          params: {
            ...r,
            tz: ctx.tz,
            categoryId: args.category_id ?? null,
            payeeKey: args.payee_key ?? null,
            minCents: args.min_amount === undefined ? null : toCentsCeil(args.min_amount),
            type: args.type ?? null,
            order: args.order,
            limit: args.limit,
          },
        },
        args,
        shape: (raw) => ({ data: { period: period_(args.from, args.to), ...money(raw) }, rows: len(obj(raw)['rows']) }),
      };
    },
  ),

  define(
    'aggregate_transactions',
    'Crunching your transactions',
    'A flexible aggregate for what the other tools cannot answer: the average expense, totals or counts per weekday or month, the number of different payees, the number of expenses under or over an amount. metric = sum | avg | count | count_distinct_payees, optionally grouped by weekday, month, category or payee, with filters (type, category, payee, min_amount, max_amount). Returns rows of {group, value, count}. Prefer the specific tools when one fits.',
    (args, ctx) => {
      const r = instants(ctx.tz, args.from, args.to);
      if (args.min_amount !== undefined && args.max_amount !== undefined && args.min_amount > args.max_amount) {
        throw new ToolArgError(`min_amount (${args.min_amount}) is above max_amount (${args.max_amount}).`);
      }
      const isMoney = args.metric === 'sum' || args.metric === 'avg';
      return {
        call: {
          name: 'aggregate_transactions',
          params: {
            ...r,
            tz: ctx.tz,
            metric: args.metric,
            groupBy: args.group_by,
            type: args.type,
            category: args.category ?? null,
            payee: args.payee ?? null,
            minCents: args.min_amount === undefined ? null : toCentsCeil(args.min_amount),
            maxCents: args.max_amount === undefined ? null : toCentsFloor(args.max_amount),
          },
        },
        args,
        shape: (raw) => {
          // `value` is money for sum / avg and a plain count otherwise.
          const doc = isMoney ? (withMoneyDisplay(raw, VALUE_KEY) as Record<string, unknown>) : obj(raw);
          return { data: { period: period_(args.from, args.to), type: args.type, ...doc }, rows: len(obj(raw)['rows']) };
        },
      };
    },
  ),
];

export const TOOL_BY_NAME: ReadonlyMap<string, AgentTool> = new Map(TOOLS.map((t) => [t.name, t]));
export const TOOL_SPECS: readonly ToolSpec[] = TOOLS.map((t) => t.spec);
