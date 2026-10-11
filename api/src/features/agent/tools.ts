import * as z from 'zod';

import type { Db } from '../../core/db';
import { chartFrom, ChartError } from './blocks';
import { parseIsoDate } from './dates';
import { buildTransactionsLink } from './deep-link';
import { shapeEntities } from './entities';
import type { ToolSpec } from './llm';
import type { AgentQueries } from './queries';
import type { SqlCell } from './sql-guard';
import type { TurnState } from './state';

/**
 * The agent's four tools. Each one is a zod schema (the single source of truth: the JSON Schema sent to
 * the model is generated from it and the model's arguments are validated with it) and a `prepare` that
 * validates the arguments synchronously and returns the label of the SSE `step` event plus the work to do.
 *
 *   run_sql            the model's SELECT, through the SQL guard (`sql-guard.ts`)
 *   find_entities      fuzzy payee / category lookup
 *   link_transactions  the deep link of the answer, checked against the user's data
 *   show_chart         a chart built from an earlier run_sql result (its numbers are the database's)
 *
 * What a turn learns (query results, entity names, the link, the chart) is kept in `TurnState`; the app
 * blocks, the deep link, the numeric check and the memory are all built from it, never from model text.
 */

export const TOOL_NAMES = ['run_sql', 'find_entities', 'link_transactions', 'show_chart'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** A tool call that could not be run as asked; the message goes back to the model as the tool result. */
export class ToolArgError extends Error {
  override name = 'ToolArgError';
}

export interface ToolContext {
  db: Db;
  userId: string;
  tz: string;
  tzOffsetMinutes: number;
  signal: AbortSignal;
  queries: AgentQueries;
  state: TurnState;
}

export interface ToolOutcome {
  /** What the model sees. Null on failure. */
  data: Record<string, unknown> | null;
  error: string | null;
  /** Result size for the trace. */
  rows: number;
  /** run_sql only: characters of SQL (the trace never holds the query text or rows). */
  sqlChars?: number;
}

export interface Prepared {
  /** Progress label of the SSE `step` event. */
  label: string;
  run: () => Promise<ToolOutcome>;
}

export interface AgentTool {
  name: ToolName;
  spec: ToolSpec;
  /** Validates the model's raw JSON arguments. Throws `ToolArgError` with a message the model can act on. */
  prepare: (rawArguments: string, ctx: ToolContext) => Prepared;
}

/* ----------------------------------------------------------------------------------------------
 * Argument schemas
 * -------------------------------------------------------------------------------------------- */

/** run_sql calls per turn (ids, and a cap on database work). */
export const MAX_SQL_PER_TURN = 12;
/** Rows (and characters of JSON) of one result shown to the model. */
const MAX_SHOWN_ROWS = 50;
const MAX_SHOWN_CHARS = 6000;
const DEFAULT_PURPOSE = 'Looking at your transactions';

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'use the format YYYY-MM-DD')
  .refine((d) => parseIsoDate(d) !== null, 'not a real calendar date');

const schemas = {
  run_sql: z.object({
    sql: z.string().min(1).describe('One SQLite SELECT (optionally WITH ... AS) over the tables in the schema context'),
    purpose: z.string().trim().max(100).optional().describe('Short label shown to the user while it runs, e.g. "Totalling June spending"'),
  }),
  find_entities: z.object({
    phrases: z.array(z.string().min(2).max(80)).min(1).max(6).describe('Payee or category names as the user wrote them (typos are fine)'),
  }),
  link_transactions: z.object({
    filter: z.enum(['payee', 'category', 'day']).describe('What the link opens: one payee, one category, or one day'),
    payee_key: z.string().min(1).max(120).optional().describe('filter payee: the payee_key'),
    category_id: z.string().min(1).max(64).optional().describe('filter category: the category id (uuid)'),
    day: isoDay.optional().describe('filter day: the local date YYYY-MM-DD'),
    from: isoDay.optional().describe('payee / category: first day of the period the answer covers (inclusive)'),
    to: isoDay.optional().describe('payee / category: last day of the period the answer covers (inclusive)'),
    label: z.string().trim().max(60).optional().describe('Button text (default: "View <name>")'),
  }),
  show_chart: z.object({
    kind: z.enum(['donut', 'cashflow', 'compare_bar']).describe('donut = shares of a total (label + one value), cashflow = amount per day (date label + one value), compare_bar = two values per label'),
    title: z.string().trim().min(1).max(80),
    result_id: z.string().min(1).max(12).describe('The result_id of an earlier run_sql result, e.g. r1'),
    label_column: z.string().min(1).max(64).describe('Column that names each slice / bar (cashflow: the date as YYYY-MM-DD)'),
    value_columns: z.array(z.string().min(1).max(64)).min(1).max(2).describe('Numeric column(s): one for donut and cashflow, two for compare_bar (period A, period B)'),
    series_labels: z.array(z.string().trim().min(1).max(40)).max(2).optional().describe('compare_bar: the names of the two periods, e.g. ["June", "May"]'),
  }),
} satisfies Record<ToolName, z.ZodType>;

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

function define<N extends ToolName>(name: N, description: string, prepare: (args: z.output<(typeof schemas)[N]>, ctx: ToolContext) => Prepared): AgentTool {
  const schema = schemas[name] as unknown as z.ZodType<z.output<(typeof schemas)[N]>>;
  return { name, spec: toSpec(name, description), prepare: (raw, ctx) => prepare(parseArgs(schema, raw), ctx) };
}

const failure = (error: string): ToolOutcome => ({ data: null, error, rows: 0 });

/* ----------------------------------------------------------------------------------------------
 * The tools
 * -------------------------------------------------------------------------------------------- */

/** The rows the model is shown: at most 50 and about 6 000 characters of JSON. */
function shownRows(rows: readonly SqlCell[][]): SqlCell[][] {
  const out: SqlCell[][] = [];
  let chars = 0;
  for (const row of rows.slice(0, MAX_SHOWN_ROWS)) {
    chars += JSON.stringify(row).length + 1;
    if (out.length > 0 && chars > MAX_SHOWN_CHARS) break;
    out.push(row);
  }
  return out;
}

export const TOOLS: readonly AgentTool[] = [
  define(
    'run_sql',
    'Run ONE read-only SQLite SELECT (optionally WITH ... AS) against the user\'s data, using the tables and columns of the schema context. Returns {result_id, columns, rows (the first 50), row_count, truncated}, or {error} with the SQLite message: fix the query and run it again. Amounts are rupees. Only one statement; no PRAGMA, no writes.',
    (args, ctx) => {
      const { state } = ctx;
      if (state.sqlCalls >= MAX_SQL_PER_TURN) throw new ToolArgError(`At most ${MAX_SQL_PER_TURN} queries per question. Answer with what you have.`);
      state.sqlCalls += 1;
      const id = `r${state.sqlCalls}`;
      return {
        label: args.purpose || DEFAULT_PURPOSE,
        run: async () => {
          const outcome = await ctx.queries.run_sql(ctx.db, ctx.userId, { sql: args.sql, tzOffsetMinutes: ctx.tzOffsetMinutes, signal: ctx.signal });
          if (!outcome.ok) return { ...failure(outcome.error), sqlChars: args.sql.length };
          const shown = shownRows(outcome.rows);
          state.runs.push({ id, columns: outcome.columns, rows: outcome.rows, shown: shown.length, truncated: outcome.truncated });
          const rowCount = outcome.rows.length;
          return {
            data: {
              result_id: id,
              columns: outcome.columns,
              rows: shown,
              row_count: rowCount,
              truncated: outcome.truncated,
              ...(shown.length < rowCount ? { rows_shown: shown.length, note: 'Only the first rows are shown. Aggregate, filter or LIMIT in SQL to see what you need.' } : {}),
              ...(outcome.truncated ? { note: 'The result was cut at 200 rows. Aggregate in SQL instead of listing everything.' } : {}),
            },
            error: null,
            rows: rowCount,
            sqlChars: args.sql.length,
          };
        },
      };
    },
  ),

  define(
    'find_entities',
    'Fuzzy-match payee (merchant or person) and category names to their keys. Returns up to 5 matches with name, payee_key or category_id, a score (1 = perfect) and exact=true when the name is identical. Use it when a name in the question was not already resolved for you; then filter by payee_key / category_id in SQL.',
    (args, ctx) => ({
      label: 'Looking up payees and categories',
      run: async () => {
        const { matches } = shapeEntities(await ctx.queries.resolve_entities(ctx.db, ctx.userId, { phrases: args.phrases }));
        for (const m of matches) {
          const type = m['type'] === 'category' ? 'category' : 'payee';
          const id = String(m[type === 'payee' ? 'payee_key' : 'category_id']);
          const name = String(m['name']);
          ctx.state.entities.push({ type, id, name });
        }
        return { data: { matches }, error: null, rows: matches.length };
      },
    }),
  ),

  define(
    'link_transactions',
    'Attach a "View transactions" link to the answer that opens the matching transactions in the app: one payee, one category (both with the period from/to the answer covers) or one day. The payee_key / category_id must be real ones for this user. Call it once, after your queries, when the answer is about one payee, category or day.',
    (args, ctx) => {
      const need = (cond: boolean, message: string): void => {
        if (!cond) throw new ToolArgError(message);
      };
      if (args.filter === 'day') need(args.day !== undefined, 'filter day needs `day` (YYYY-MM-DD).');
      else {
        need(args.filter === 'payee' ? args.payee_key !== undefined : args.category_id !== undefined, args.filter === 'payee' ? 'filter payee needs `payee_key`.' : 'filter category needs `category_id`.');
        need(args.from !== undefined && args.to !== undefined, 'payee and category links need `from` and `to` (inclusive YYYY-MM-DD dates).');
        need((args.from ?? '') <= (args.to ?? ''), '`from` is after `to`.');
      }
      return {
        label: 'Linking the transactions',
        run: async () => {
          let id: string | undefined;
          let name: string | undefined;
          if (args.filter !== 'day') {
            id = (args.filter === 'payee' ? args.payee_key : args.category_id) ?? '';
            const target = await ctx.queries.link_target(ctx.db, ctx.userId, { filter: args.filter, id });
            if (!target) return failure(args.filter === 'payee' ? `No payee with payee_key "${id.slice(0, 60)}" in the user's data. Use find_entities or a payee_key from a query.` : `No category with id "${id.slice(0, 60)}" visible to the user. Use find_entities or an id from a query.`);
            name = target.name;
          }
          const link = buildTransactionsLink({
            tz: ctx.tz,
            filter: args.filter,
            ...(id ? { id } : {}),
            ...(name ? { name } : {}),
            ...(args.from ? { from: args.from } : {}),
            ...(args.to ? { to: args.to } : {}),
            ...(args.day ? { day: args.day } : {}),
            ...(args.label ? { label: args.label } : {}),
          });
          if (!link) return failure('That link could not be built. Check the ids and dates.');
          ctx.state.link = link; // the last valid link wins
          ctx.state.linkRange = args.from && args.to ? { from: args.from, to: args.to } : null;
          if (id && name) {
            ctx.state.entities.push({ type: args.filter as 'payee' | 'category', id, name });
          }
          return { data: { ok: true, label: link['label'] ?? null }, error: null, rows: 1 };
        },
      };
    },
  ),

  define(
    'show_chart',
    'Attach ONE small chart to the answer, drawn from the rows of an earlier run_sql result (so its numbers are the database\'s). donut: shares of a total (a label column and one value column); cashflow: spending per day (a date column YYYY-MM-DD and an amount column); compare_bar: two values per label (e.g. this month vs last month by category). Only worth it when the answer has several items to compare. At most one chart per answer.',
    (args, ctx) => {
      const { state } = ctx;
      return {
        label: 'Drawing a chart',
        run: () => {
          if (state.chart) return Promise.resolve(failure('Only one chart per answer; one is already attached.'));
          const run = state.runs.find((r) => r.id === args.result_id);
          if (!run) {
            const known = state.runs.map((r) => r.id).join(', ');
            return Promise.resolve(failure(`Unknown result_id "${args.result_id}". ${known ? `Available: ${known}.` : 'Run a query first.'} A result from this same step can only be charted in the next step.`));
          }
          try {
            state.chart = chartFrom(args, run);
          } catch (err) {
            if (err instanceof ChartError) return Promise.resolve(failure(err.message));
            throw err;
          }
          return Promise.resolve({ data: { ok: true, chart: args.kind }, error: null, rows: 1 });
        },
      };
    },
  ),
];

export const TOOL_BY_NAME: ReadonlyMap<string, AgentTool> = new Map(TOOLS.map((t) => [t.name, t]));
export const TOOL_SPECS: readonly ToolSpec[] = TOOLS.map((t) => t.spec);
