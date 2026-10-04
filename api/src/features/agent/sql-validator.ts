import { parseSql, SqlSyntaxError } from './pg-parser';
import type { PgNode } from './pg-parser';
import { ALLOWED_TABLES } from './schema-context';

/**
 * Validation of agent-generated SQL (port of `sql_validator.py`, rules of audit item S2), on the
 * real PostgreSQL parse tree (libpg-query) instead of sqlglot.
 *
 * Accepts exactly one `SELECT` / `WITH ... SELECT` (set operations, VALUES and TABLE included) that
 * only reads allowlisted `public` tables (CTE names scoped per WITH clause) and calls no denied
 * function. The result is wrapped as `SELECT * FROM (<q>) AS _q LIMIT n` so the row cap always
 * applies, and the wrapper is parsed again to prove it still is one SELECT with that LIMIT.
 *
 * This is defense in depth: the executor additionally runs it as role `authenticated` (RLS) inside a
 * read-only transaction with a statement timeout.
 */

const DEFAULT_LIMIT = 500;
const MAX_SQL_CHARS = 20_000;
const SQL_PREVIEW_CHARS = 200;

/** Exact names that must never run in agent SQL: config, file/IO, introspection, executing other SQL. */
const DENIED_FUNCTIONS: ReadonlySet<string> = new Set([
  'pg_sleep',
  'set_config',
  'current_setting',
  'pg_read_file',
  'pg_read_binary_file',
  'pg_ls_dir',
  'query_to_xml',
  'query_to_xml_and_xmlschema',
  'query_to_xmlschema',
  'table_to_xml',
  'table_to_xml_and_xmlschema',
  'table_to_xmlschema',
  'cursor_to_xml',
  'cursor_to_xmlschema',
  'schema_to_xml',
  'schema_to_xml_and_xmlschema',
  'schema_to_xmlschema',
  'database_to_xml',
  'database_to_xml_and_xmlschema',
  'database_to_xmlschema',
  'nextval',
  'setval',
  'lastval',
  'currval',
  'ts_stat',
  // Beyond Python: this project's own RPCs take a user id argument, so they must never be reachable from agent SQL.
  'transactions_period_summary',
  'transactions_daily_totals',
  'transactions_payee_totals',
  'update_category_with_budget',
]);
const DENIED_FUNCTION_PREFIXES = ['pg_', 'dblink', 'lo_', 'txid_', 'has_', 'http_'] as const;

/** Table-valued functions allowed in FROM / JOIN (everything else is rejected). */
const ALLOWED_TABLE_FUNCTIONS: ReadonlySet<string> = new Set(['generate_series']);

/** Casts to these types resolve catalog objects by name or oid (`'pg_roles'::regclass`, `10::regrole`). */
const DENIED_CAST_TYPES: ReadonlySet<string> = new Set([
  'regclass',
  'regproc',
  'regprocedure',
  'regoper',
  'regoperator',
  'regtype',
  'regrole',
  'regnamespace',
  'regconfig',
  'regdictionary',
  'regcollation',
]);

/** Syntax that is rejected wherever it appears, with the keyword reported to the model. */
const FORBIDDEN_STATEMENT_KEYWORDS: Record<string, string> = {
  InsertStmt: 'INSERT',
  UpdateStmt: 'UPDATE',
  DeleteStmt: 'DELETE',
  MergeStmt: 'MERGE',
  VariableSetStmt: 'SET',
  VariableShowStmt: 'SHOW',
  CopyStmt: 'COPY',
  TransactionStmt: 'TRANSACTION',
  ExplainStmt: 'EXPLAIN',
  CallStmt: 'CALL',
  DoStmt: 'DO',
};

export interface ValidationResult {
  ok: boolean;
  sql: string;
  error?: string;
}

const fail = (sql: string, error: string): ValidationResult => ({ ok: false, sql, error });

/** Everything the walk objects to; reported by priority (keyword, then function, then tables) like Python. */
class Findings {
  keyword: string | undefined;
  fn: string | undefined;
  readonly tables = new Set<string>();

  message(): string | null {
    if (this.keyword !== undefined) return `Forbidden SQL keyword detected: ${this.keyword}`;
    if (this.fn !== undefined) return `Forbidden function: ${this.fn}`;
    if (this.tables.size > 0) return `Disallowed tables: ${[...this.tables].sort().join(', ')}`;
    return null;
  }
}

function isNodeBody(v: unknown): v is PgNode {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A raw node: `{ NodeType: {...} }` (exactly one key, capitalized). */
function nodeEntry(node: unknown): [string, PgNode] | null {
  if (!isNodeBody(node)) return null;
  const keys = Object.keys(node);
  const key = keys[0];
  if (keys.length !== 1 || key === undefined || !/^[A-Z]/.test(key)) return null;
  const body = node[key];
  return isNodeBody(body) ? [key, body] : null;
}

function stringList(nodes: unknown): string[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((n) => {
    const entry = nodeEntry(n);
    const sval = entry?.[1]['sval'];
    return typeof sval === 'string' ? sval : '';
  });
}

function checkFunction(funcname: unknown, found: Findings): void {
  const parts = stringList(funcname);
  const name = (parts.at(-1) ?? '').toLowerCase();
  const schema = parts.length >= 2 ? (parts.at(-2) ?? '').toLowerCase() : null;
  if (parts.length > 2 || (schema !== null && schema !== 'pg_catalog')) {
    found.fn ??= parts.join('.').toLowerCase();
  } else if (DENIED_FUNCTIONS.has(name) || DENIED_FUNCTION_PREFIXES.some((p) => name.startsWith(p))) {
    found.fn ??= name;
  }
}

function checkCast(typeName: unknown, found: Findings): void {
  const names = isNodeBody(typeName) ? stringList(typeName['names']) : [];
  const last = (names.at(-1) ?? '').toLowerCase();
  if (DENIED_CAST_TYPES.has(last)) found.fn ??= `::${last}`;
}

/** FROM-clause functions: generate_series only (the call itself is also function-checked by the walk). */
function checkRangeFunction(body: PgNode, found: Findings): void {
  const functions = body['functions'];
  if (!Array.isArray(functions)) return;
  for (const item of functions) {
    const list = nodeEntry(item)?.[1]['items'];
    if (!Array.isArray(list)) continue;
    for (const element of list) {
      const call = nodeEntry(element);
      if (call?.[0] !== 'FuncCall') continue;
      const parts = stringList(call[1]['funcname']);
      const name = (parts.at(-1) ?? '').toLowerCase();
      const qualified = parts.length > 1 && (parts.at(-2) ?? '').toLowerCase() !== 'pg_catalog';
      if (!ALLOWED_TABLE_FUNCTIONS.has(name) || qualified) found.tables.add(`${parts.join('.')}()`);
    }
  }
}

function checkTable(body: PgNode, visibleCtes: ReadonlySet<string>, found: Findings): void {
  const relname = typeof body['relname'] === 'string' ? body['relname'] : '';
  const schema = typeof body['schemaname'] === 'string' ? body['schemaname'] : null;
  const catalog = typeof body['catalogname'] === 'string' ? body['catalogname'] : null;
  if (catalog !== null) {
    found.tables.add(`${catalog}.${schema ?? ''}.${relname}`);
  } else if (schema !== null) {
    if (schema.toLowerCase() !== 'public' || !ALLOWED_TABLES.has(relname)) found.tables.add(`${schema.toLowerCase()}.${relname}`);
  } else if (!visibleCtes.has(relname) && !ALLOWED_TABLES.has(relname)) {
    found.tables.add(relname);
  }
}

/** Walk any parse-tree value. `visible` holds the CTE names that can be referenced at this point. */
function walk(value: unknown, visible: ReadonlySet<string>, found: Findings): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visible, found);
    return;
  }
  if (!isNodeBody(value)) return;

  const entry = nodeEntry(value);
  if (!entry) {
    for (const child of Object.values(value)) walk(child, visible, found);
    return;
  }
  const [type, body] = entry;
  if (type === 'SelectStmt') return walkSelect(body, visible, found);

  const keyword = FORBIDDEN_STATEMENT_KEYWORDS[type] ?? (type.endsWith('Stmt') ? type.slice(0, -4).toUpperCase() : undefined);
  if (keyword !== undefined) found.keyword ??= keyword;
  else if (type === 'RangeVar') checkTable(body, visible, found);
  else if (type === 'FuncCall') checkFunction(body['funcname'], found);
  else if (type === 'TypeCast') checkCast(body['typeName'], found);
  else if (type === 'RangeTableFunc') found.tables.add('xmltable()');
  else if (type === 'JsonTable') found.tables.add('json_table()');

  for (const child of Object.values(body)) walk(child, visible, found);
  if (type === 'RangeFunction') checkRangeFunction(body, found);
}

function walkSelect(select: PgNode, outer: ReadonlySet<string>, found: Findings): void {
  if (select['intoClause'] != null) found.keyword ??= 'INTO';
  if (Array.isArray(select['lockingClause']) && select['lockingClause'].length > 0) found.keyword ??= 'LOCK';

  let visible = outer;
  const withClause = select['withClause'];
  if (isNodeBody(withClause)) {
    const recursive = withClause['recursive'] === true;
    const ctes = Array.isArray(withClause['ctes']) ? withClause['ctes'] : [];
    const names = ctes.map((c) => {
      const name = nodeEntry(c)?.[1]['ctename'];
      return typeof name === 'string' ? name : '';
    });
    // WITH RECURSIVE: every sibling (and the CTE itself) is visible inside every CTE body.
    // Plain WITH: a CTE only sees the ones declared before it.
    const all = new Set([...outer, ...names]);
    ctes.forEach((cte, index) => {
      const seen = recursive ? all : new Set([...outer, ...names.slice(0, index)]);
      walk(nodeEntry(cte)?.[1]['ctequery'], seen, found);
    });
    visible = all;
  }

  for (const [key, child] of Object.entries(select)) {
    if (key === 'withClause' || key === 'intoClause' || key === 'lockingClause') continue;
    // Set-operation arms are bare SELECT bodies.
    if ((key === 'larg' || key === 'rarg') && isNodeBody(child)) walkSelect(child, visible, found);
    else walk(child, visible, found);
  }
}

function singleStatement(stmts: { stmt: PgNode }[], sql: string): PgNode | ValidationResult {
  if (stmts.length === 0) return fail(sql, 'SQL is empty');
  if (stmts.length > 1) return fail(sql, 'Multiple statements are not allowed');
  return (stmts[0] as { stmt: PgNode }).stmt;
}

const isFailure = (v: PgNode | ValidationResult): v is ValidationResult => 'ok' in v && typeof v['ok'] === 'boolean';

/** Wrapper proof: one SELECT, whose only FROM item is a subquery aliased `_q`, with the expected LIMIT. */
function wrapperIsIntact(tree: PgNode, limit: number): boolean {
  const select = nodeEntry(tree)?.[1];
  if (nodeEntry(tree)?.[0] !== 'SelectStmt' || !select) return false;
  const from = select['fromClause'];
  if (!Array.isArray(from) || from.length !== 1) return false;
  const sub = nodeEntry(from[0]);
  if (sub?.[0] !== 'RangeSubselect') return false;
  const alias = sub[1]['alias'];
  if (!isNodeBody(alias) || alias['aliasname'] !== '_q') return false;
  const count = nodeEntry(select['limitCount'])?.[1];
  const ival = isNodeBody(count?.['ival']) ? count['ival']['ival'] : undefined;
  return select['limitOption'] === 'LIMIT_OPTION_COUNT' && ival === limit && select['withClause'] == null && select['op'] === 'SETOP_NONE';
}

export async function validateSelectSql(rawSql: string, options: { maxRows?: number } = {}): Promise<ValidationResult> {
  // Leading and trailing semicolons are noise (Python stripped trailing ones; sqlglot ignored empty statements).
  const sql = rawSql.replace(/^[\s;]+|[\s;]+$/g, '');
  if (!sql) return fail(sql, 'SQL is empty');
  if (sql.includes('\u0000')) return fail(sql, 'SQL contains a null byte');
  if (sql.length > MAX_SQL_CHARS) return fail(sql, `SQL is too long (max ${MAX_SQL_CHARS} characters)`);

  let stmts: { stmt: PgNode }[];
  try {
    stmts = (await parseSql(sql)).stmts;
  } catch (err) {
    if (err instanceof SqlSyntaxError) return fail(sql, `Could not parse SQL: ${err.message.slice(0, SQL_PREVIEW_CHARS)}`);
    throw err; // parser failed to load: not the model's fault
  }

  const statement = singleStatement(stmts, sql);
  if (isFailure(statement)) return statement;
  const root = nodeEntry(statement);
  if (root?.[0] !== 'SelectStmt') return fail(sql, 'Only SELECT queries are allowed');

  const found = new Findings();
  walk(statement, new Set(), found);
  const objection = found.message();
  if (objection !== null) return fail(sql, objection);

  const limit = Math.max(1, Math.trunc(options.maxRows ?? DEFAULT_LIMIT));
  // A line comment must not swallow the closing parenthesis.
  const sep = sql.includes('--') ? '\n' : '';
  const wrapped = `SELECT * FROM (${sep}${sql}${sep}) AS _q LIMIT ${limit}`;
  try {
    const check = singleStatement((await parseSql(wrapped)).stmts, wrapped);
    if (isFailure(check) || !wrapperIsIntact(check, limit)) return fail(sql, 'Could not apply the row limit to this query');
  } catch (err) {
    if (err instanceof SqlSyntaxError) return fail(sql, 'Could not apply the row limit to this query');
    throw err;
  }
  return { ok: true, sql: wrapped };
}
