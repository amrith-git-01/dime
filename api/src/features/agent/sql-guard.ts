import type { Db } from '../../core/db';
import { TurnAbortedError } from './llm';

/**
 * The security core of the SQL agent: the model's SELECT never touches a real table.
 *
 * SQLite resolves an unqualified table name to a CTE of the same name first, so every query runs as
 *
 *   SELECT * FROM (WITH <scoped views>, <empty shadows>, <the model's own CTEs> <the model's query>) LIMIT 201
 *
 * where the views (`transactions`, `categories`, `budgets`, `category_budgets`, `recurring_items`) are
 * bound to the signed-in user (`?1`), drop internal columns and convert money to rupees, and EVERY other
 * table of the database is shadowed by an empty CTE, so naming one reads nothing. On top of that a small
 * lexer validates the text: one SELECT/WITH statement, no write/DDL/PRAGMA keywords, no schema
 * qualifiers (`main.`, `temp.`) that would bypass the CTE lookup, no `sqlite_*` / `_cf_*` / `pragma_*`
 * names, no recursive CTEs. The text that runs is rebuilt from what the lexer saw (comments removed),
 * so what was validated is exactly what is executed.
 *
 * `test/agent-sql-guard.test.ts` fails when a migration adds a table that is neither exposed nor shadowed.
 */

export const MAX_SQL_CHARS = 4000;
/** Rows kept per query; one more is requested to know whether the result was cut. */
export const MAX_ROWS = 200;
const QUERY_TIMEOUT_MS = 3000;

/** Tables the model can read, with the columns of the view (the schema context documents the same list). */
export const EXPOSED_TABLES = {
  transactions: ['id', 'type', 'amount', 'local_date', 'local_at', 'transaction_at', 'category_id', 'counterparty_name', 'counterparty_type', 'payee_key', 'detected_via', 'recurring_item_id'],
  categories: ['id', 'name', 'is_system'],
  budgets: ['monthly_budget', 'daily_budget'],
  category_budgets: ['category_id', 'monthly_amount'],
  recurring_items: ['id', 'kind', 'name', 'amount', 'category_id', 'cadence', 'day_of_month', 'month_of_year', 'next_due_date', 'active'],
} as const;

/** Every other table: shadowed by an empty CTE, so a query naming it just sees no rows. */
export const SHADOWED_TABLES = [
  'users',
  'notifications',
  'user_settings',
  'user_feedback',
  'user_push_tokens',
  'email_sends',
  'jobs',
  'agent_usage',
  'agent_feedback',
  'auth_identities',
  'auth_sessions',
  'ai_usage',
  'ai_user_usage',
  'd1_migrations',
] as const;

const TABLE_NAMES: ReadonlySet<string> = new Set([...Object.keys(EXPOSED_TABLES), ...SHADOWED_TABLES]);
const TABLE_LIST = Object.keys(EXPOSED_TABLES).join(', ');

/** ?1 = user id, ?2 = UTC offset modifier such as '+330 minutes'. */
const VIEWS = [
  `transactions AS (SELECT id, type, amount / 100.0 AS amount, date(datetime(transaction_at, ?2)) AS local_date, datetime(transaction_at, ?2) AS local_at, transaction_at, category_id, counterparty_name, counterparty_type, payee_key, detected_via, recurring_item_id FROM main.transactions WHERE user_id = ?1 AND deleted_at IS NULL)`,
  `categories AS (SELECT id, name, is_system FROM main.categories WHERE user_id IS NULL OR user_id = ?1)`,
  `budgets AS (SELECT monthly_budget / 100.0 AS monthly_budget, daily_budget / 100.0 AS daily_budget FROM main.budgets WHERE user_id = ?1)`,
  `category_budgets AS (SELECT category_id, monthly_amount / 100.0 AS monthly_amount FROM main.category_budgets WHERE user_id = ?1)`,
  `recurring_items AS (SELECT id, kind, name, amount / 100.0 AS amount, category_id, cadence, day_of_month, month_of_year, next_due_date, active FROM main.recurring_items WHERE user_id = ?1)`,
];
const SHADOWS = SHADOWED_TABLES.map((name) => `${name} AS (SELECT NULL AS x WHERE 0)`);
const SCOPE = [...VIEWS, ...SHADOWS].join(', ');

/* ----------------------------------------------------------------------------------------------
 * Lexer
 * -------------------------------------------------------------------------------------------- */

interface Token {
  kind: 'word' | 'ident' | 'string' | 'number' | 'punct';
  /** Words lower-cased, quoted identifiers unquoted, everything else as written. */
  text: string;
  /** Offsets in the cleaned text. */
  start: number;
  end: number;
}

class SqlRejected extends Error {}

const isIdentStart = (c: string): boolean => /[A-Za-z_]/.test(c) || c.charCodeAt(0) >= 128;
const isIdentPart = (c: string): boolean => /[A-Za-z0-9_$]/.test(c) || c.charCodeAt(0) >= 128;
const isDigit = (c: string): boolean => c >= '0' && c <= '9';

/** Reads a quoted run starting at `i` (the quote); a doubled quote is an escaped quote. Returns the end offset (exclusive) and the content. */
function readQuoted(sql: string, i: number, quote: string): { end: number; content: string } {
  let j = i + 1;
  let content = '';
  for (;;) {
    if (j >= sql.length) throw new SqlRejected('Unterminated quote in the query.');
    const c = sql.charAt(j);
    if (c === quote) {
      if (sql.charAt(j + 1) === quote) {
        content += quote;
        j += 2;
        continue;
      }
      return { end: j + 1, content };
    }
    content += c;
    j += 1;
  }
}

/** Tokens plus the text without comments (a comment becomes one space, literals and quoted names are kept verbatim). */
function lex(sql: string): { clean: string; tokens: Token[] } {
  let clean = '';
  const tokens: Token[] = [];
  const push = (kind: Token['kind'], text: string, raw: string) => {
    tokens.push({ kind, text, start: clean.length, end: clean.length + raw.length });
    clean += raw;
  };
  let i = 0;
  while (i < sql.length) {
    const c = sql.charAt(i);
    const next = sql.charAt(i + 1);
    if (c === '\0') throw new SqlRejected('The query contains a NUL character.');
    if (/\s/.test(c)) {
      clean += c;
      i += 1;
    } else if (c === '-' && next === '-') {
      const eol = sql.indexOf('\n', i);
      i = eol === -1 ? sql.length : eol;
      clean += ' ';
    } else if (c === '/' && next === '*') {
      const close = sql.indexOf('*/', i + 2);
      i = close === -1 ? sql.length : close + 2;
      clean += ' ';
    } else if (c === "'") {
      const { end } = readQuoted(sql, i, "'");
      push('string', sql.slice(i, end), sql.slice(i, end));
      i = end;
    } else if (c === '"' || c === '`') {
      const { end, content } = readQuoted(sql, i, c);
      push('ident', content, sql.slice(i, end));
      i = end;
    } else if (c === '[') {
      const close = sql.indexOf(']', i + 1);
      if (close === -1) throw new SqlRejected('Unterminated [identifier] in the query.');
      push('ident', sql.slice(i + 1, close), sql.slice(i, close + 1));
      i = close + 1;
    } else if (isIdentStart(c)) {
      let j = i + 1;
      while (j < sql.length && isIdentPart(sql.charAt(j))) j += 1;
      push('word', sql.slice(i, j).toLowerCase(), sql.slice(i, j));
      i = j;
    } else if (isDigit(c) || (c === '.' && isDigit(next))) {
      let j = i + 1;
      while (j < sql.length && (isIdentPart(sql.charAt(j)) || sql.charAt(j) === '.')) j += 1;
      push('number', sql.slice(i, j), sql.slice(i, j));
      i = j;
    } else if (c === '?' || c === '@' || c === '$' || c === ':') {
      throw new SqlRejected('Bind parameters (?, :name, @name, $name) are not supported: write the values into the query.');
    } else {
      push('punct', c, c);
      i += 1;
    }
  }
  return { clean, tokens };
}

/* ----------------------------------------------------------------------------------------------
 * Validation
 * -------------------------------------------------------------------------------------------- */

/** Statement keywords that must never appear (REPLACE is allowed only as the string function replace(...)). */
const FORBIDDEN_WORDS: ReadonlySet<string> = new Set([
  'attach', 'detach', 'pragma', 'insert', 'update', 'delete', 'replace', 'upsert', 'create', 'drop', 'alter',
  'vacuum', 'reindex', 'analyze', 'recursive', 'begin', 'commit', 'rollback', 'savepoint', 'release',
]);

/** Names (words or quoted) that are never allowed: schemas, internals and functions that read files, load code or allocate memory. */
const FORBIDDEN_NAMES: ReadonlySet<string> = new Set([
  'main', 'temp', 'temporary', 'load_extension', 'readfile', 'writefile', 'edit', 'fts3_tokenizer', 'dbstat', 'randomblob', 'zeroblob',
]);
const FORBIDDEN_PREFIXES = ['sqlite_', '_cf_', 'pragma_'];

export interface ValidSql {
  /** The model's query without comments or trailing semicolons. */
  query: string;
  /** Offset in `query` just after the leading WITH when the query starts with one. */
  withEnd: number | null;
}

/** Throws `SqlRejected` with a message for the model; returns the cleaned query otherwise. */
function check(sql: string): ValidSql {
  if (sql.length > MAX_SQL_CHARS) throw new SqlRejected(`The query is ${sql.length} characters; the maximum is ${MAX_SQL_CHARS}. Simplify it.`);
  const { clean, tokens } = lex(sql);

  // Trailing semicolons are fine; any other one means a second statement.
  let last = tokens.length;
  while (last > 0 && tokens[last - 1]?.kind === 'punct' && tokens[last - 1]?.text === ';') last -= 1;
  const body = tokens.slice(0, last);
  if (body.length === 0) throw new SqlRejected('The query is empty.');
  if (body.some((t) => t.kind === 'punct' && t.text === ';')) throw new SqlRejected('Only one statement is allowed.');

  const first = body[0];
  if (!first || first.kind !== 'word' || (first.text !== 'select' && first.text !== 'with')) throw new SqlRejected('Only SELECT queries are allowed (optionally starting with WITH ... AS).');

  let depth = 0;
  for (const [i, t] of body.entries()) {
    if (t.kind === 'punct') {
      if (t.text === '(') depth += 1;
      if (t.text === ')') depth -= 1;
      if (depth < 0) throw new SqlRejected('Unbalanced parentheses in the query.');
      continue;
    }
    if (t.kind === 'word') {
      if (FORBIDDEN_WORDS.has(t.text) && !(t.text === 'replace' && body[i + 1]?.text === '(' && body[i + 1]?.kind === 'punct')) {
        throw new SqlRejected(t.text === 'recursive' ? 'Recursive CTEs are not allowed.' : `"${t.text.toUpperCase()}" is not allowed: this tool only reads data with SELECT.`);
      }
    }
    if (t.kind === 'word' || t.kind === 'ident') {
      const name = t.text.toLowerCase();
      if (FORBIDDEN_NAMES.has(name) || FORBIDDEN_PREFIXES.some((p) => name.startsWith(p))) {
        throw new SqlRejected(`The name "${t.text}" is not allowed. Use plain table names without a schema prefix: ${TABLE_LIST}.`);
      }
    }
  }
  if (depth !== 0) throw new SqlRejected('Unbalanced parentheses in the query.');

  // A CTE of the model's own must not reuse the name of a table (it would hide the scoped view).
  for (const [i, t] of body.entries()) {
    if (t.kind !== 'word' || t.text !== 'as') continue;
    const after = body[i + 1];
    const defines = after && ((after.kind === 'punct' && after.text === '(') || (after.kind === 'word' && (after.text === 'materialized' || after.text === 'not')));
    if (!defines) continue;
    let nameAt = i - 1;
    if (body[nameAt]?.kind === 'punct' && body[nameAt]?.text === ')') {
      let d = 0;
      for (; nameAt >= 0; nameAt--) {
        const p = body[nameAt];
        if (p?.kind === 'punct' && p.text === ')') d += 1;
        if (p?.kind === 'punct' && p.text === '(') {
          d -= 1;
          if (d === 0) break;
        }
      }
      nameAt -= 1;
    }
    const name = body[nameAt];
    if (name && (name.kind === 'word' || name.kind === 'ident') && TABLE_NAMES.has(name.text.toLowerCase())) {
      throw new SqlRejected(`"${name.text}" is a table name; give your CTE another name.`);
    }
  }

  return { query: clean.slice(first.start, body[body.length - 1]?.end ?? first.end), withEnd: first.text === 'with' ? first.end - first.start : null };
}

export type SqlValidation = { ok: true; value: ValidSql } | { ok: false; error: string };

export function validateSql(sql: string): SqlValidation {
  try {
    return { ok: true, value: check(sql) };
  } catch (err) {
    if (err instanceof SqlRejected) return { ok: false, error: err.message };
    throw err;
  }
}

/** The statement that runs: our scoped views first, then the model's own CTEs and query, capped at one more row than we keep. */
export function buildScopedSql(valid: ValidSql): string {
  const inner = valid.withEnd === null ? `WITH ${SCOPE} ${valid.query}` : `WITH ${SCOPE}, ${valid.query.slice(valid.withEnd)}`;
  return `SELECT * FROM (${inner}) LIMIT ${MAX_ROWS + 1}`;
}

/* ----------------------------------------------------------------------------------------------
 * Execution
 * -------------------------------------------------------------------------------------------- */

export type SqlCell = string | number | null;

export type SqlOutcome = { ok: true; columns: string[]; rows: SqlCell[][]; truncated: boolean } | { ok: false; error: string };

export interface SqlRunOptions {
  /** The user's current UTC offset in minutes (see `utcOffsetMinutes`). */
  tzOffsetMinutes: number;
  /** The turn's signal: aborting rejects with `TurnAbortedError` (the query itself cannot be cancelled on D1). */
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * ponytail: SQLite has no IANA zones, so local_date / local_at use the user's UTC offset AT QUERY TIME as a
 * fixed number of minutes. Right for India (no DST); in a DST zone, rows from the other half of the year are
 * off by one hour (a late-evening row can land on the wrong day). Revisit with per-row offsets if that matters.
 */
export const offsetModifier = (minutes: number): string => `${minutes < 0 ? '-' : '+'}${Math.abs(Math.trunc(minutes))} minutes`;

/** Numbers without float noise (SUM of rupee REALs), blobs and other values as text. */
function toCell(value: unknown): SqlCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isInteger(value) ? value : Math.round(value * 1e6) / 1e6;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return '[binary]';
}

/** What the model is told about a failed query: the SQLite message without driver prefixes or offsets into our wrapper. */
export function describeSqlError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw
    .replace(/^(?:Error:\s*)?D1_ERROR:\s*/, '')
    .replace(/\s+at offset \d+/, '')
    .replace(/:\s*SQLITE_[A-Z_]+.*$/s, '')
    .trim()
    .slice(0, 300);
  if (msg === '') return 'The query failed.';
  return /no such table/i.test(msg) ? `${msg}. Available tables: ${TABLE_LIST}.` : msg;
}

export async function runGuardedSql(db: Db, userId: string, sql: string, opts: SqlRunOptions): Promise<SqlOutcome> {
  const checked = validateSql(sql);
  if (!checked.ok) return checked;
  if (opts.signal?.aborted) throw new TurnAbortedError('The turn was cancelled or ran out of time.');

  const statement = db.prepare(buildScopedSql(checked.value)).bind(userId, offsetModifier(opts.tzOffsetMinutes));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const guards = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SqlRejected('The query took too long. Filter to a date range, aggregate in SQL or simplify the joins.')), opts.timeoutMs ?? QUERY_TIMEOUT_MS);
    onAbort = () => reject(new TurnAbortedError('The turn was cancelled or ran out of time.'));
    opts.signal?.addEventListener('abort', onAbort, { once: true });
  });
  const query = statement.raw<unknown[]>({ columnNames: true });
  try {
    const [columns, ...rows] = await Promise.race([query, guards]);
    const truncated = rows.length > MAX_ROWS;
    return { ok: true, columns: (columns ?? []).map(String), rows: rows.slice(0, MAX_ROWS).map((r) => r.map(toCell)), truncated };
  } catch (err) {
    query.catch(() => undefined);
    if (err instanceof TurnAbortedError) throw err;
    return { ok: false, error: err instanceof SqlRejected ? err.message : describeSqlError(err) };
  } finally {
    clearTimeout(timer);
    if (onAbort) opts.signal?.removeEventListener('abort', onAbort);
    guards.catch(() => undefined);
  }
}
