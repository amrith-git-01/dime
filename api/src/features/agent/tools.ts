import * as z from 'zod';

import type { LocalDate } from '../../core/timezone';
import { daysBetween, daysInMonth, isoDate, parseIsoDate, today, toInstantRange } from './dates';
import type { InstantRange } from './dates';
import type { ToolSpec } from './llm';
import { withMoneyDisplay } from './money';
import { RUN_SQL_SCHEMA } from './schema-context';

/**
 * The agent's tools. Each one is a zod schema (the single source of truth: the JSON Schema sent to the
 * model is generated from it and the model's arguments are validated with it), a planner that turns
 * validated arguments into ONE parameterized SQL call of an `agent_*` Postgres function (migration
 * 20261005000100_agent_v2.sql), and a shaper that makes the function's jsonb compact and adds the
 * `<money>_display` twins.
 *
 * Date arguments are INCLUSIVE local dates (`YYYY-MM-DD`, the user's timezone). The database is always
 * called with the half-open UTC instants `[from 00:00, to + 1 day 00:00)`. Every value is bound as `text`
 * and cast in SQL (`$1::text::timestamptz`), so the driver never has to infer parameter types.
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
  'run_sql',
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

export interface SqlCall {
  text: string;
  params: (string | null)[];
}

export interface ToolOutput {
  /** What the model sees (compact, money with display twins). */
  data: Record<string, unknown>;
  /** Result size for logs (rows, categories, matches...). */
  rows: number;
  /** Extra raw data for app blocks (e.g. compare_months). Not sent to the model. */
  blockData?: Record<string, unknown>;
}

export type Prepared =
  | {
      kind: 'sql';
      call: SqlCall;
      /** Additional calls pipelined in the same transaction; their results reach `shape` (and never the model). */
      extra?: SqlCall[];
      args: Record<string, unknown>;
      shape: (raw: unknown, extra: readonly unknown[]) => ToolOutput;
    }
  | { kind: 'run_sql'; query: string; args: Record<string, unknown> };

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
  run_sql: z.object({ query: z.string().min(6).max(4000).describe('One read-only SELECT statement') }),
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

const fn = (name: string, ...casts: string[]): string =>
  `select public.${name}(${casts.map((c, i) => (c === 'text' ? `$${i + 1}::text` : `$${i + 1}::text::${c}`)).join(', ')}) as r`;

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

export function resolveEntitiesCall(phrases: readonly string[]): SqlCall {
  return {
    text: 'select public.agent_resolve_entities(array(select jsonb_array_elements_text($1::text::jsonb))) as r',
    params: [JSON.stringify(phrases)],
  };
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

/* ----------------------------------------------------------------------------------------------
 * run_sql
 * -------------------------------------------------------------------------------------------- */

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
      kind: 'sql',
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
        kind: 'sql',
        call: { text: fn('agent_spending_summary', 'timestamptz', 'timestamptz', 'uuid', 'text'), params: [r.from, r.to, args.category_id ?? null, args.payee_key ?? null] },
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
        kind: 'sql',
        call: { text: fn('agent_category_breakdown', 'timestamptz', 'timestamptz', 'text'), params: [r.from, r.to, args.type] },
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
        kind: 'sql',
        call: { text: fn('agent_top_payees', 'timestamptz', 'timestamptz', 'uuid', 'int'), params: [r.from, r.to, args.category_id ?? null, String(args.limit)] },
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
        kind: 'sql',
        call: { text: fn('agent_daily_cashflow', 'timestamptz', 'timestamptz', 'text'), params: [r.from, r.to, ctx.tz] },
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
      const extra: SqlCall[] | undefined = kind
        ? [
            ...[a, b].map((r): SqlCall => ({ text: fn('agent_daily_cashflow', 'timestamptz', 'timestamptz', 'text'), params: [r.from, r.to, ctx.tz] })),
            ...[a, b].map((r): SqlCall => ({ text: fn('agent_top_payees', 'timestamptz', 'timestamptz', 'uuid', 'int'), params: [r.from, r.to, null, '5'] })),
          ]
        : undefined;
      return {
        kind: 'sql',
        call: { text: fn('agent_compare_periods', 'timestamptz', 'timestamptz', 'timestamptz', 'timestamptz', 'text'), params: [a.from, a.to, b.from, b.to, args.by] },
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
        kind: 'sql',
        call: { text: fn('agent_budget_status', 'timestamptz', 'timestamptz'), params: [r.from, r.to] },
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
        kind: 'sql',
        call: {
          text: fn('agent_list_transactions', 'timestamptz', 'timestamptz', 'text', 'uuid', 'text', 'numeric', 'text', 'text', 'int'),
          params: [r.from, r.to, ctx.tz, args.category_id ?? null, args.payee_key ?? null, args.min_amount === undefined ? null : String(args.min_amount), args.type ?? null, args.order, String(args.limit)],
        },
        args,
        shape: (raw) => ({ data: { period: period_(args.from, args.to), ...money(raw) }, rows: len(obj(raw)['rows']) }),
      };
    },
  ),

  define(
    'run_sql',
    'Running a custom query',
    `FALLBACK ONLY, when no other tool can answer (for example averages, weekday patterns, custom filters). Runs one read-only SELECT; at most 20 rows come back. ${RUN_SQL_SCHEMA}`,
    (args) => ({ kind: 'run_sql', query: args.query, args }),
  ),
];

export const TOOL_BY_NAME: ReadonlyMap<string, AgentTool> = new Map(TOOLS.map((t) => [t.name, t]));
export const TOOL_SPECS: readonly ToolSpec[] = TOOLS.map((t) => t.spec);
