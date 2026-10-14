import { beforeEach, describe, expect, it } from 'vitest';

import { EXPOSED_TABLES, MAX_ROWS, SHADOWED_TABLES, buildScopedSql, describeSqlError, offsetModifier, runGuardedSql, validateSql } from '../src/features/agent/sql-guard';
import type { SqlOutcome } from '../src/features/agent/sql-guard';
import { SCHEMA_CONTEXT } from '../src/features/agent/schema-context';
import { TurnAbortedError } from '../src/features/agent/llm';
import { USER_ID, seedBudget, seedCategory, seedCategoryBudget, seedJob, seedNotification, seedTransaction, seedUser, testDb, uid } from './db';

const OTHER = '22222222-2222-2222-2222-222222222222';
const IST = 330;

const run = (sql: string, user = USER_ID, tzOffsetMinutes = IST): Promise<SqlOutcome> => runGuardedSql(testDb(), user, sql, { tzOffsetMinutes });

async function rows(sql: string, user = USER_ID): Promise<unknown[][]> {
  const out = await run(sql, user);
  if (!out.ok) throw new Error(`query failed: ${out.error}`);
  return out.rows;
}

async function failure(sql: string, user = USER_ID): Promise<string> {
  const out = await run(sql, user);
  if (out.ok) throw new Error(`expected a rejection, got ${JSON.stringify(out.rows)}`);
  return out.error;
}

let ownCategory = '';
let otherCategory = '';

beforeEach(async () => {
  await seedUser(OTHER, { email: 'other@example.com', username: 'Mallory' });
  ownCategory = await seedCategory({ name: 'My Gadgets' });
  otherCategory = await seedCategory({ name: 'Their Secret Stash', user_id: OTHER });
  await seedTransaction({ amount: '100.00', counterparty_name: 'Swiggy', category_id: ownCategory, transaction_at: '2026-10-04T10:00:00.000Z', note: 'my private note' });
  await seedTransaction({ amount: '250.50', counterparty_name: 'Zomato', transaction_at: '2026-10-04T19:00:00.000Z' }); // 00:30 IST on the 5th
  await seedTransaction({ amount: '5000', type: 'credit', counterparty_name: 'Acme Payroll', transaction_at: '2026-10-01T04:00:00.000Z' });
  await seedTransaction({ amount: '999.00', counterparty_name: 'Deleted Shop', deleted_at: '2026-10-04T12:00:00.000Z' });
  await seedTransaction({ user_id: OTHER, amount: '777.00', counterparty_name: 'SecretCo', category_id: otherCategory, note: 'their note', receipt_url: 'https://example.com/r.jpg' });
  await seedBudget({ monthly: '20000' });
  await seedBudget({ user_id: OTHER, monthly: '99999' });
  await seedCategoryBudget(ownCategory, '1500');
  await seedCategoryBudget(otherCategory, '4242', OTHER);
  await seedNotification({ user_id: OTHER, title: 'Their notification' });
  await seedJob({ user_id: OTHER, kind: 'receipt' });
  await testDb()
    .prepare('INSERT INTO auth_sessions (id, user_id, refresh_hash, family_id, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(uid(), OTHER, 'secret-refresh-hash', 'fam', '2027-01-01T00:00:00.000Z')
    .run();
});

describe('sql guard: the exposed views', () => {
  it('shows only the signed-in user rows, in rupees, without deleted rows', async () => {
    expect(await rows('SELECT counterparty_name, amount, type FROM transactions ORDER BY amount')).toEqual([
      ['Swiggy', 100, 'debit'],
      ['Zomato', 250.5, 'debit'],
      ['Acme Payroll', 5000, 'credit'],
    ]);
    expect(await rows('SELECT counterparty_name FROM transactions', OTHER)).toEqual([['SecretCo']]);
    expect(await rows('SELECT ROUND(SUM(amount), 2) FROM transactions WHERE type = \'debit\'')).toEqual([[350.5]]);
  });

  it('computes local_date and local_at from the UTC offset', async () => {
    expect(await rows("SELECT counterparty_name, local_date, local_at FROM transactions WHERE type = 'debit' ORDER BY transaction_at")).toEqual([
      ['Swiggy', '2026-10-04', '2026-10-04 15:30:00'],
      ['Zomato', '2026-10-05', '2026-10-05 00:30:00'],
    ]);
    expect(await rows("SELECT local_date FROM transactions WHERE counterparty_name = 'Zomato'")).toEqual([['2026-10-05']]);
    // UTC and a western offset move the same instant to other days.
    const utc = await run("SELECT local_date FROM transactions WHERE counterparty_name = 'Zomato'", USER_ID, 0);
    expect(utc.ok && utc.rows).toEqual([['2026-10-04']]);
    const west = await run("SELECT local_at FROM transactions WHERE counterparty_name = 'Zomato'", USER_ID, -300);
    expect(west.ok && west.rows).toEqual([['2026-10-04 14:00:00']]);
    expect(offsetModifier(330)).toBe('+330 minutes');
    expect(offsetModifier(-300)).toBe('-300 minutes');
  });

  it('hides internal columns: user_id, notes, receipts, voice, payment hash, deleted_at', async () => {
    for (const column of ['user_id', 'note', 'receipt_url', 'voice_url', 'payment_hash', 'deleted_at', 'counterparty_normalized', 'updated_at']) {
      expect(await failure(`SELECT ${column} FROM transactions`)).toMatch(/no such column/i);
    }
    expect(await failure('SELECT user_id FROM categories')).toMatch(/no such column/i);
    expect(await failure('SELECT user_id FROM budgets')).toMatch(/no such column/i);
    expect(await failure('SELECT icon_name FROM categories')).toMatch(/no such column/i);
  });

  it('categories: the system ones and the own ones, never another user\'s', async () => {
    const names = (await rows('SELECT name FROM categories ORDER BY name')).map((r) => r[0]);
    expect(names).toContain('My Gadgets');
    expect(names).toContain('Food & Dining');
    expect(names).not.toContain('Their Secret Stash');
  });

  it('budgets and category budgets are the user\'s own, in rupees', async () => {
    expect(await rows('SELECT monthly_budget FROM budgets')).toEqual([[20000]]);
    expect(await rows('SELECT monthly_budget FROM budgets', OTHER)).toEqual([[99999]]);
    expect(await rows('SELECT c.name, cb.monthly_amount FROM category_budgets cb JOIN categories c ON c.id = cb.category_id')).toEqual([['My Gadgets', 1500]]);
  });

  it('joins a transaction to its category and groups by payee', async () => {
    expect(await rows("SELECT COALESCE(c.name, 'Uncategorized') AS category, SUM(t.amount) FROM transactions t LEFT JOIN categories c ON c.id = t.category_id WHERE t.type = 'debit' GROUP BY t.category_id ORDER BY 2 DESC")).toEqual([
      ['Uncategorized', 250.5],
      ['My Gadgets', 100],
    ]);
  });

  it('keeps ORDER BY and a model WITH clause, and reports the column names', async () => {
    const out = await run('WITH big AS (SELECT counterparty_name AS payee, amount FROM transactions WHERE amount > 50) SELECT payee, amount FROM big ORDER BY amount DESC;');
    expect(out).toEqual({ ok: true, columns: ['payee', 'amount'], rows: [['Acme Payroll', 5000], ['Zomato', 250.5], ['Swiggy', 100]], truncated: false });
  });

  it('keeps duplicate column names and returns columns of an empty result', async () => {
    const dup = await run('SELECT amount, amount FROM transactions LIMIT 1');
    expect(dup.ok && dup.columns).toEqual(['amount', 'amount:1']); // D1 numbers repeated names
    const empty = await run("SELECT id, amount FROM transactions WHERE amount > 1000000");
    expect(empty).toMatchObject({ ok: true, rows: [] });
  });

  it('rounds float noise and caps rows at 200 (truncated), one more is never returned', async () => {
    const noise = await run("SELECT SUM(amount) FROM (SELECT 0.1 AS amount UNION ALL SELECT 0.2)");
    expect(noise.ok && noise.rows).toEqual([[0.3]]);
    const many = await run('WITH n(i) AS (SELECT 1 UNION ALL SELECT 2) SELECT a.i FROM n a, n b, n c, n d, n e, n f, n g, n h, n i2');
    expect(many.ok && many.rows.length).toBe(MAX_ROWS);
    expect(many.ok && many.truncated).toBe(true);
  });

  it('exposed views and the schema context list the same columns', async () => {
    for (const [table, columns] of Object.entries(EXPOSED_TABLES)) {
      const out = await run(`SELECT * FROM ${table} LIMIT 1`);
      expect(out.ok && out.columns).toEqual([...columns]);
      expect(SCHEMA_CONTEXT).toContain(`### ${table}`);
      for (const column of columns) expect(SCHEMA_CONTEXT).toContain(column);
    }
  });
});

describe('sql guard: user A cannot reach user B or internals', () => {
  it('every real table is exposed or shadowed (a new migration cannot leak)', async () => {
    const { results } = await testDb().prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'").all<{ name: string }>();
    const covered = new Set<string>([...Object.keys(EXPOSED_TABLES), ...SHADOWED_TABLES]);
    expect(results.map((r) => r.name).filter((n) => !covered.has(n) && n !== 'd1_migrations')).toEqual([]);
    expect(results.length).toBeGreaterThanOrEqual(15);
    // Triggers and views would be new attack surface too.
    const extra = await testDb().prepare("SELECT name FROM sqlite_master WHERE type IN ('view', 'trigger')").all<{ name: string }>();
    expect(extra.results).toEqual([]);
  });

  it('shadowed tables are empty even for the owner (users, sessions, notifications, jobs, usage...)', async () => {
    for (const table of SHADOWED_TABLES) expect(await rows(`SELECT COUNT(*) FROM ${table}`, OTHER)).toEqual([[0]]);
    expect(await rows('SELECT * FROM users')).toEqual([]);
    expect(await failure('SELECT refresh_hash FROM auth_sessions', OTHER)).toMatch(/no such column/i);
    expect(await failure('SELECT email FROM users')).toMatch(/no such column/i);
    expect(await failure('SELECT title FROM notifications', OTHER)).toMatch(/no such column/i);
  });

  it('UNION into other tables adds nothing', async () => {
    expect(await rows('SELECT id FROM transactions UNION SELECT x FROM users UNION SELECT x FROM auth_sessions UNION SELECT x FROM jobs')).toHaveLength(3);
    expect(await rows('SELECT counterparty_name FROM transactions UNION ALL SELECT x FROM notifications')).toHaveLength(3);
  });

  it('schema qualifiers are rejected in every spelling', async () => {
    for (const sql of [
      'SELECT * FROM main.transactions',
      'SELECT * FROM "main"."transactions"',
      'SELECT * FROM `main`.`transactions`',
      'SELECT * FROM [main].[transactions]',
      'SELECT * FROM MAIN . transactions',
      'SELECT * FROM temp.sqlite_master',
      'SELECT * FROM "temp"."x"',
      'SELECT main.transactions.id FROM transactions',
    ]) {
      expect(await failure(sql), sql).toMatch(/not allowed/i);
    }
  });

  it('sqlite_master, sqlite_schema, sqlite_temp_master, pragma functions and internal names are rejected', async () => {
    for (const sql of [
      'SELECT * FROM sqlite_master',
      'SELECT name FROM SQLITE_SCHEMA',
      'SELECT * FROM "sqlite_master"',
      'SELECT * FROM sqlite_temp_master',
      "SELECT * FROM pragma_table_info('users')",
      'SELECT * FROM pragma_database_list',
      'SELECT * FROM _cf_KV',
      'SELECT sqlite_version()',
      'SELECT * FROM dbstat',
      "SELECT load_extension('x')",
      'SELECT randomblob(1000000000)',
      'SELECT zeroblob(1000000000)',
      "SELECT readfile('/etc/passwd')",
    ]) {
      expect(await failure(sql), sql).toMatch(/not allowed/i);
    }
  });

  it('writes, DDL, PRAGMA, ATTACH and transactions are rejected (and nothing changes)', async () => {
    const before = await rows('SELECT COUNT(*) FROM transactions');
    for (const sql of [
      "DELETE FROM transactions",
      "UPDATE transactions SET amount = 1",
      "INSERT INTO transactions (id) VALUES ('x')",
      "REPLACE INTO categories (id, name) VALUES ('x', 'y')",
      'DROP TABLE transactions',
      'CREATE TABLE evil (x)',
      'ALTER TABLE transactions ADD COLUMN x',
      "PRAGMA table_info('users')",
      "ATTACH DATABASE ':memory:' AS evil",
      'DETACH DATABASE main',
      'VACUUM',
      'REINDEX',
      'ANALYZE',
      'BEGIN',
      'WITH x AS (SELECT 1) DELETE FROM transactions',
      'WITH x AS (SELECT 1) UPDATE transactions SET amount = 0',
      "WITH x AS (SELECT 1) INSERT INTO transactions (id) VALUES ('x')",
      "WITH x AS (SELECT 1) REPLACE INTO categories (id, name) VALUES ('x', 'y')",
      'EXPLAIN SELECT 1',
      '(SELECT 1)',
    ]) {
      expect(await failure(sql), sql).toMatch(/not allowed|Only SELECT/i);
    }
    expect(await rows('SELECT COUNT(*) FROM transactions')).toEqual(before);
    expect(await testDb().prepare('SELECT COUNT(*) AS n FROM transactions WHERE user_id = ?').bind(OTHER).first()).toEqual({ n: 1 });
  });

  it('recursive CTEs are rejected, plain CTEs work', async () => {
    expect(await failure('WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM c) SELECT n FROM c LIMIT 5')).toMatch(/Recursive/);
    expect(await failure('WITH recursive c(n) AS (SELECT 1) SELECT n FROM c')).toMatch(/Recursive/);
    expect(await rows('WITH a AS (SELECT 1 AS n), b AS (SELECT n + 1 AS m FROM a) SELECT m FROM b')).toEqual([[2]]);
  });

  it('multiple statements are rejected; a trailing semicolon and comments are fine', async () => {
    expect(await failure('SELECT 1; SELECT 2')).toMatch(/one statement/i);
    expect(await failure('SELECT 1; DELETE FROM transactions')).toMatch(/one statement/i);
    expect(await failure("SELECT 1 ; -- harmless\n DROP TABLE x")).toMatch(/one statement|not allowed/i);
    expect(await rows('SELECT 1;')).toEqual([[1]]);
    expect(await rows('SELECT 1 ;;  ')).toEqual([[1]]);
    expect(await rows('/* lead */ SELECT /* mid */ 2 -- tail')).toEqual([[2]]);
    expect(await rows('SELECT 3 -- a comment with ) and ; and DELETE FROM x')).toEqual([[3]]);
  });

  it('comment tricks cannot hide or reveal anything', async () => {
    // The keyword hides behind a comment opener only if the lexer got string/comment states wrong.
    expect(await failure('SELECT 1 /* */ ; /* */ DELETE FROM transactions')).toMatch(/one statement/i);
    expect(await failure('SELECT * FROM /* x */ main /* y */ . /* z */ transactions')).toMatch(/not allowed/i);
    expect(await failure('SELECT 1 -- \n; DROP TABLE transactions')).toMatch(/one statement/i);
    // A comment cannot swallow the closing of the wrapper: the commented tail is removed before running.
    expect(await rows('SELECT 1 AS n --')).toEqual([[1]]);
    expect(await rows('SELECT 1 AS n /* unterminated')).toEqual([[1]]);
    expect(await rows("SELECT '--' AS a, '/*' AS b")).toEqual([['--', '/*']]);
    expect(await rows("SELECT counterparty_name FROM transactions WHERE counterparty_name = 'Swiggy' -- ) UNION SELECT x FROM users")).toEqual([['Swiggy']]);
  });

  it('unbalanced parentheses cannot break out of the wrapper', async () => {
    expect(await failure('SELECT 1) UNION SELECT x FROM users WHERE (1')).toMatch(/Unbalanced/);
    expect(await failure('SELECT (1')).toMatch(/Unbalanced/);
    expect(await failure("SELECT ')' FROM transactions WHERE (")).toMatch(/Unbalanced|syntax|incomplete/i);
  });

  it('string literals may contain keywords and names', async () => {
    expect(await rows("SELECT 'DELETE FROM main.transactions; DROP TABLE x' AS s")).toEqual([['DELETE FROM main.transactions; DROP TABLE x']]);
    expect(await rows("SELECT 'it''s main' AS s")).toEqual([["it's main"]]);
    expect(await rows("SELECT counterparty_name FROM transactions WHERE counterparty_name LIKE '%delete%'")).toEqual([]);
    expect(await rows("SELECT replace(counterparty_name, 'Swiggy', 'S') FROM transactions WHERE payee_key = 'swiggy'")).toEqual([['S']]);
  });

  it('model CTEs may not reuse a table name (they would hide the scoped view)', async () => {
    for (const sql of [
      'WITH transactions AS (SELECT 1 AS id) SELECT * FROM transactions',
      'WITH users AS (SELECT 1) SELECT * FROM users',
      'WITH t AS (SELECT 1), "categories"(a) AS (SELECT 1) SELECT * FROM t',
      'WITH t AS MATERIALIZED (SELECT 1), jobs AS NOT MATERIALIZED (SELECT 2) SELECT * FROM t',
      'SELECT * FROM (WITH transactions AS (SELECT 1 AS id) SELECT * FROM transactions)',
    ]) {
      expect(await failure(sql), sql).toMatch(/table name/i);
    }
    // An alias with a table's name is only an alias.
    expect(await rows('SELECT t.id FROM transactions AS categories, transactions t WHERE t.id = categories.id LIMIT 1')).toHaveLength(1);
  });

  it('bind parameters, NUL and unterminated quotes are rejected', async () => {
    expect(await failure('SELECT ?1')).toMatch(/Bind parameters/);
    expect(await failure('SELECT :name')).toMatch(/Bind parameters/);
    expect(await failure('SELECT * FROM transactions WHERE user_id = @u')).toMatch(/Bind parameters/);
    expect(await failure("SELECT 'abc")).toMatch(/Unterminated/);
    expect(await failure('SELECT "abc')).toMatch(/Unterminated/);
    expect(await failure('SELECT 1\0')).toMatch(/NUL/);
  });

  it('cannot filter to another user: user_id does not exist and the id of B returns nothing', async () => {
    expect(await failure(`SELECT * FROM transactions WHERE user_id = '${OTHER}'`)).toMatch(/no such column/i);
    expect(await rows("SELECT * FROM transactions WHERE counterparty_name = 'SecretCo'")).toEqual([]);
    expect(await rows("SELECT * FROM categories WHERE name = 'Their Secret Stash'")).toEqual([]);
    expect(await rows("SELECT * FROM transactions WHERE category_id = (SELECT id FROM categories WHERE name = 'Their Secret Stash')")).toEqual([]);
  });

  it('limits the length of the query', async () => {
    expect(await failure(`SELECT '${'x'.repeat(4000)}'`)).toMatch(/maximum is 4000/);
  });

  it('timeouts and aborts do not hang the turn', async () => {
    const slow = await runGuardedSql(testDb(), USER_ID, 'WITH n(i) AS (SELECT 1 UNION ALL SELECT 2) SELECT count(*) FROM n a, n b', { tzOffsetMinutes: IST, timeoutMs: 0 });
    // timeoutMs 0 loses the race against the database most of the time; either way it never throws.
    expect(typeof slow.ok).toBe('boolean');
    const controller = new AbortController();
    controller.abort();
    await expect(runGuardedSql(testDb(), USER_ID, 'SELECT 1', { tzOffsetMinutes: IST, signal: controller.signal })).rejects.toBeInstanceOf(TurnAbortedError);
  });
});

describe('sql guard: lexical validation and errors', () => {
  it('builds the scoped statement with our views first, then the model CTEs, capped at 201 rows', () => {
    const plain = validateSql('SELECT 1');
    expect(plain.ok && buildScopedSql(plain.value)).toMatch(/^SELECT \* FROM \(WITH transactions AS \(.*users AS \(SELECT NULL AS x WHERE 0\).* SELECT 1\) LIMIT 201$/);
    const merged = validateSql('WITH a AS (SELECT 1 AS n) SELECT n FROM a');
    expect(merged.ok && buildScopedSql(merged.value).replace(/\s+/g, ' ')).toContain('WHERE 0), a AS (SELECT 1 AS n) SELECT n FROM a) LIMIT 201');
  });

  it('turns SQLite errors into short messages for the model', () => {
    expect(describeSqlError(new Error('D1_ERROR: no such column: foo at offset 133: SQLITE_ERROR'))).toBe('no such column: foo');
    expect(describeSqlError(new Error('D1_ERROR: no such table: nope: SQLITE_ERROR'))).toMatch(/^no such table: nope\. Available tables: transactions, categories/);
    expect(describeSqlError(new Error('D1_ERROR: near ")": syntax error at offset 4000: SQLITE_ERROR'))).toBe('near ")": syntax error');
    expect(describeSqlError('')).toBe('The query failed.');
  });

  it('reports real SQLite errors from D1 without the wrapper', async () => {
    expect(await failure('SELECT nope FROM transactions')).toBe('no such column: nope');
    expect(await failure('SELECT * FROM nothing_here')).toMatch(/^no such table: nothing_here\. Available tables:/);
    expect(await failure('SELECT FROM')).toMatch(/syntax error/);
    expect(await failure('SELECT 1 1')).toMatch(/syntax error/);
    expect(await failure('SELECT substr(1)')).toMatch(/wrong number of arguments/);
  });

  it('lets a harmless query through the validator and nothing else', () => {
    for (const sql of ['select 1', 'WITH a AS (SELECT 1) SELECT * FROM a', 'SELECT 1;', "SELECT strftime('%w', '2026-10-05')"]) expect(validateSql(sql).ok, sql).toBe(true);
    for (const sql of ['', '   ', ';', '-- only a comment']) expect(validateSql(sql).ok, sql).toBe(false);
  });
});
