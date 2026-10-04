import { log } from '../../core/logging';
import { validateSelectSql } from './sql-validator';

/**
 * Database access of the agent. Everything runs in ONE READ ONLY transaction per agent step:
 *   set_config('request.jwt.claims', <sub/role/aud>, true)   -- what Supabase RLS policies / auth.uid() read
 *   set local role authenticated                              -- RLS now applies
 *   set local statement_timeout = '<ms>ms'
 *   <the statements of the step>
 * The setup statements and the step's statements are pipelined on the one pinned connection (a single
 * network wait; that is also why the client is created with `max: 1`). Anything that goes wrong inside
 * the database is returned as error text so the loop can feed it back to the model; only an
 * unreachable database throws `AgentDbUnavailableError`.
 *
 *  - `executeToolCalls`: the `agent_*` function calls of one step (independent calls, pipelined).
 *  - `executeReadonlySql`: the `run_sql` fallback (validated, LIMIT-wrapped SELECT), in its own transaction
 *    because a failing statement would abort a shared one.
 */

/** The slice of a postgres.js transaction handle this module needs (lets tests inject a fake). */
export interface SqlTx {
  unsafe(query: string, params?: readonly unknown[]): PromiseLike<readonly Record<string, unknown>[]>;
}

/** The slice of a postgres.js client this module needs. */
export interface SqlClient {
  begin<T>(options: string, fn: (tx: SqlTx) => Promise<T>): Promise<T>;
  end(options?: { timeout?: number }): Promise<void>;
}

export interface SqlExecutionResult {
  rows: Record<string, unknown>[];
  row_count: number;
  columns: string[];
  truncated: boolean;
  error: string | null;
  elapsed_ms: number;
}

/** Database unreachable / out of connections: the route answers 503 + Retry-After. */
export class AgentDbUnavailableError extends Error {
  override name = 'AgentDbUnavailableError';
}

const CONNECTION_ERROR_CODES = new Set([
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_DESTROYED',
  'CONNECTION_ENDED',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
]);

/** Transport failures that carry no code: workerd's socket ("connection attempt failed"), Hyperdrive, resets. */
const TRANSPORT_MESSAGE_RE =
  /connection attempt failed|network connection lost|connection[ _](?:refused|reset|terminated|closed|ended|destroyed|timed? ?out)|connect timeout|socket|hyperdrive|ECONN|ETIMEDOUT/i;

/**
 * Connection-level failures (driver codes, SQLSTATE classes 08 / 53 / 28 / 57P0x, or a transport
 * error from the runtime), as opposed to errors the database reports about the query itself.
 */
export function isDbUnavailable(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { code, name, message } = err as { code?: unknown; name?: unknown; message?: unknown };
  if (typeof code === 'string' && (CONNECTION_ERROR_CODES.has(code) || /^(08|53|28)/.test(code) || /^57P0[1-3]$/.test(code))) return true;
  // A PostgresError came back from the server, so the database is reachable.
  if (name === 'PostgresError') return false;
  return typeof message === 'string' && TRANSPORT_MESSAGE_RE.test(message);
}

/** Python `_json_safe`: numeric/bigint become numbers, dates ISO strings (`+00:00` offset like Python). */
export function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().replace(/\.000Z$/, 'Z').replace(/Z$/, '+00:00');
  }
  if (value instanceof Uint8Array) return `\\x${[...value].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  return value;
}

function failure(error: string, started: number): SqlExecutionResult {
  return { rows: [], row_count: 0, columns: [], truncated: false, error, elapsed_ms: Date.now() - started };
}

export interface ExecuteOptions {
  userId: string;
  maxRows: number;
  timeoutMs: number;
}

/** The three transaction-local statements that make RLS and `auth.uid()` see the user. */
function setupStatements(tx: SqlTx, userId: string, timeoutMs: number): PromiseLike<unknown>[] {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated' });
  const ms = Math.max(1, Math.trunc(timeoutMs));
  return [
    tx.unsafe("select set_config('request.jwt.claims', $1, true)", [claims]),
    tx.unsafe('set local role authenticated'),
    tx.unsafe(`set local statement_timeout = '${ms}ms'`),
  ];
}

export async function executeReadonlySql(sql: SqlClient, rawSql: string, options: ExecuteOptions): Promise<SqlExecutionResult> {
  const started = Date.now();
  const validation = await validateSelectSql(rawSql, { maxRows: options.maxRows });
  if (!validation.ok) return failure(validation.error ?? 'Invalid SQL', started);

  try {
    const records = await sql.begin('read only', async (tx) => {
      const [, , , result] = await Promise.all([...setupStatements(tx, options.userId, options.timeoutMs), tx.unsafe(validation.sql)]);
      return result as readonly Record<string, unknown>[];
    });

    const rows = records.map((record) => Object.fromEntries(Object.entries(record).map(([k, v]) => [k, jsonSafe(v)])));
    const first = rows[0];
    return {
      rows,
      row_count: rows.length,
      columns: first ? Object.keys(first) : [],
      truncated: rows.length >= options.maxRows,
      error: null,
      elapsed_ms: Date.now() - started,
    };
  } catch (err) {
    if (isDbUnavailable(err)) throw new AgentDbUnavailableError('Agent database is unavailable.', { cause: err });
    const e = err instanceof Error ? err : new Error(String(err));
    log.warn('agent_sql_failed', { error: e.message.slice(0, 300) });
    return failure(`${e.name}: ${e.message}`, started);
  }
}

/** One parameterized call of an `agent_*` function: `select public.agent_x($1::text::..) as r`. */
export interface ToolSql {
  text: string;
  params: readonly (string | null)[];
}

export type ToolSqlResult = { ok: true; value: unknown } | { ok: false; error: string };

/** What the model is told when a database error hits one call of a step. */
function describeToolError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/statement timeout|canceling statement/i.test(message)) return 'The query took too long. Try a shorter period.';
  if (/current transaction is aborted/i.test(message)) return 'Skipped because another call of the same step failed. Call it again.';
  log.warn('agent_tool_sql_failed', { error: message.slice(0, 300) });
  return 'The query failed. Check the arguments or try another approach.';
}

/**
 * Runs the independent function calls of ONE agent step in one read-only transaction (pipelined, so the
 * step costs a single network wait). Results come back in call order; one failing call does not hide the
 * others' outcome (they report their own error), and an unreachable database throws.
 */
export async function executeToolCalls(
  sql: SqlClient,
  userId: string,
  calls: readonly ToolSql[],
  options: { timeoutMs: number },
): Promise<{ results: ToolSqlResult[]; ms: number }> {
  const started = Date.now();
  try {
    const results = await sql.begin('read only', async (tx) => {
      const settled = await Promise.allSettled([
        ...setupStatements(tx, userId, options.timeoutMs),
        ...calls.map((c) => tx.unsafe(c.text, c.params)),
      ]);
      const setupFailure = settled.slice(0, 3).find((r) => r.status === 'rejected');
      if (setupFailure) throw setupFailure.reason;
      return settled.slice(3).map((r): ToolSqlResult => {
        if (r.status === 'fulfilled') return { ok: true, value: (r.value as readonly Record<string, unknown>[])[0]?.['r'] };
        if (isDbUnavailable(r.reason)) throw r.reason;
        return { ok: false, error: describeToolError(r.reason) };
      });
    });
    return { results, ms: Date.now() - started };
  } catch (err) {
    if (isDbUnavailable(err)) throw new AgentDbUnavailableError('Agent database is unavailable.', { cause: err });
    throw err;
  }
}
