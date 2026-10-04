import { log } from '../../core/logging';
import { validateSelectSql } from './sql-validator';

/**
 * Executes validated agent SQL (port of `sql_executor.py`). One READ ONLY transaction per query:
 *   set_config('request.jwt.claims', <sub/role/aud>, true)   -- what Supabase RLS policies read
 *   set local role authenticated                              -- RLS now applies
 *   set local statement_timeout = '<ms>ms'
 *   <validated, LIMIT-wrapped SELECT>
 * The three setup statements and the query are pipelined on the one connection (a single network
 * wait). Anything that goes wrong inside the database is returned as `error` text so the loop can
 * ask the model to fix its SQL; only an unreachable database throws `AgentDbUnavailableError`.
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

export async function executeReadonlySql(sql: SqlClient, rawSql: string, options: ExecuteOptions): Promise<SqlExecutionResult> {
  const started = Date.now();
  const validation = await validateSelectSql(rawSql, { maxRows: options.maxRows });
  if (!validation.ok) return failure(validation.error ?? 'Invalid SQL', started);

  const timeoutMs = Math.max(1, Math.trunc(options.timeoutMs));
  const claims = JSON.stringify({ sub: options.userId, role: 'authenticated', aud: 'authenticated' });

  try {
    const records = await sql.begin('read only', async (tx) => {
      const [, , , result] = await Promise.all([
        tx.unsafe("select set_config('request.jwt.claims', $1, true)", [claims]),
        tx.unsafe('set local role authenticated'),
        tx.unsafe(`set local statement_timeout = '${timeoutMs}ms'`),
        tx.unsafe(validation.sql),
      ]);
      return result;
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
