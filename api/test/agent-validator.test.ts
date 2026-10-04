import { describe, expect, it } from 'vitest';

import { validateSelectSql } from '../src/features/agent/sql-validator';

/** Port of backend/tests/features/agent/test_sql_validator*.py, plus extra bypass fixtures. */

describe('validateSelectSql: accepted queries', () => {
  it('accepts a simple select and wraps it with the row limit', async () => {
    const result = await validateSelectSql('SELECT id FROM transactions');
    expect(result.ok).toBe(true);
    expect(result.sql).toBe('SELECT * FROM (SELECT id FROM transactions) AS _q LIMIT 500');
  });

  it('keeps an inner LIMIT and still caps with the outer one', async () => {
    const result = await validateSelectSql('SELECT id FROM transactions LIMIT 10', { maxRows: 50 });
    expect(result.ok).toBe(true);
    expect(result.sql.endsWith('AS _q LIMIT 50')).toBe(true);
    expect(result.sql).toContain('LIMIT 10');
  });

  it.each(['transactions', 'categories', 'budgets', 'category_budgets', 'users'])('allows the core table %s', async (table) => {
    expect((await validateSelectSql(`SELECT id FROM ${table}`)).ok).toBe(true);
  });

  it('accepts a CTE with a join and wraps the whole statement', async () => {
    const result = await validateSelectSql(
      "WITH spend AS (SELECT category_id, SUM(amount) AS total FROM transactions WHERE type = 'debit' GROUP BY category_id) " +
        'SELECT c.name, spend.total FROM spend JOIN categories c ON c.id = spend.category_id',
      { maxRows: 25 },
    );
    expect(result.ok).toBe(true);
    expect(result.sql.startsWith('SELECT * FROM (WITH spend AS')).toBe(true);
    expect(result.sql.endsWith(') AS _q LIMIT 25')).toBe(true);
  });

  it('accepts public-qualified tables, unions, generate_series and recursive CTEs', async () => {
    expect((await validateSelectSql('SELECT id FROM public.transactions')).ok).toBe(true);
    expect((await validateSelectSql('SELECT id FROM budgets UNION SELECT id FROM categories')).ok).toBe(true);
    expect((await validateSelectSql('SELECT g FROM generate_series(1, 5) AS g')).ok).toBe(true);
    const recursive = await validateSelectSql(
      'WITH RECURSIVE n AS (SELECT 1 AS a UNION ALL SELECT a + 1 FROM n WHERE a < 5) SELECT * FROM n',
    );
    expect(recursive.ok).toBe(true);
  });

  it('accepts the shapes the prompt teaches (budget join, payee subquery, comparison CASE)', async () => {
    const budget = await validateSelectSql(
      "SELECT b.monthly_budget, COALESCE(SUM(t.amount), 0) AS spent FROM budgets b LEFT JOIN transactions t ON t.type = 'debit' AND t.deleted_at IS NULL " +
        "AND t.transaction_at >= '2026-06-01T00:00:00+05:30' AND t.transaction_at <= '2026-06-30T23:59:59.999999+05:30' GROUP BY b.monthly_budget",
    );
    expect(budget.ok).toBe(true);
    const payee = await validateSelectSql(
      "SELECT t.counterparty_normalized, MAX(t.counterparty_name) AS counterparty_name, SUM(t.amount) AS total FROM transactions t WHERE t.counterparty_normalized = " +
        "(SELECT counterparty_normalized FROM transactions WHERE counterparty_name ILIKE '%uber%' GROUP BY counterparty_normalized ORDER BY SUM(amount) DESC LIMIT 1) GROUP BY 1",
    );
    expect(payee.ok).toBe(true);
    const compare = await validateSelectSql(
      "SELECT c.name AS category_name, SUM(CASE WHEN t.transaction_at BETWEEN '2026-06-01' AND '2026-06-30' THEN t.amount ELSE 0 END) AS period_a_amount " +
        'FROM transactions t JOIN categories c ON c.id = t.category_id GROUP BY c.name ORDER BY 2 DESC LIMIT 8',
    );
    expect(compare.ok).toBe(true);
    const dates = await validateSelectSql(
      "SELECT date_trunc('day', transaction_at AT TIME ZONE 'Asia/Kolkata')::date AS d, to_char(transaction_at, 'YYYY-MM') AS m, EXTRACT(month FROM transaction_at) FROM transactions",
    );
    expect(dates.ok).toBe(true);
  });

  it('puts the wrapper on its own lines when the query has a line comment', async () => {
    const result = await validateSelectSql('SELECT id FROM transactions -- newest first');
    expect(result.ok).toBe(true);
    expect(result.sql).toBe('SELECT * FROM (\nSELECT id FROM transactions -- newest first\n) AS _q LIMIT 500');
  });

  it('ignores leading and repeated semicolons like Python did', async () => {
    const expected = 'SELECT * FROM (SELECT 1) AS _q LIMIT 500';
    expect((await validateSelectSql(';;SELECT 1')).sql).toBe(expected);
    expect((await validateSelectSql('SELECT 1 ; ;')).sql).toBe(expected);
    expect((await validateSelectSql(' ; SELECT 1;; ')).sql).toBe(expected);
  });

  it('strips a trailing semicolon', async () => {
    expect((await validateSelectSql('SELECT id FROM transactions;')).sql).toBe('SELECT * FROM (SELECT id FROM transactions) AS _q LIMIT 500');
  });
});

describe('validateSelectSql: rejected queries', () => {
  it('rejects empty SQL', async () => {
    const result = await validateSelectSql('   ');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('SQL is empty');
    expect((await validateSelectSql(';')).error).toBe('SQL is empty');
  });

  it('rejects multiple statements', async () => {
    const result = await validateSelectSql('SELECT 1; SELECT 2');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Multiple statements');
  });

  it('rejects a non-SELECT statement', async () => {
    const result = await validateSelectSql('DELETE FROM transactions');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Only SELECT');
  });

  it('rejects SELECT INTO', async () => {
    const result = await validateSelectSql('SELECT * INTO temp FROM transactions');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Forbidden SQL keyword');
  });

  it('rejects a table that is not allowlisted', async () => {
    const result = await validateSelectSql('SELECT * FROM secret_table');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Disallowed tables');
    expect(result.error).toContain('secret_table');
  });

  it.each([
    ['SELECT t.id FROM transactions t, pg_roles r', 'pg_roles'],
    ['SELECT id FROM transactions WHERE user_id IN (SELECT oid::text FROM pg_authid)', 'pg_authid'],
    ['SELECT * FROM information_schema.tables', 'information_schema.tables'],
    ['SELECT * FROM pg_catalog.pg_class', 'pg_catalog.pg_class'],
    ['SELECT * FROM other_schema.transactions', 'other_schema.transactions'],
    ['SELECT * FROM "pg_roles"', 'pg_roles'],
    ['WITH x AS (SELECT * FROM pg_shadow) SELECT * FROM x', 'pg_shadow'],
    // A CTE name only shields references that can actually see it.
    ['SELECT * FROM pg_roles, (WITH pg_roles AS (SELECT 1) SELECT * FROM pg_roles) q', 'pg_roles'],
    // Beyond the Python fixtures: plain (non-recursive) WITH cannot see itself or later siblings.
    ['WITH pg_roles AS (SELECT * FROM pg_roles) SELECT * FROM pg_roles', 'pg_roles'],
    ['WITH a AS (SELECT * FROM b), b AS (SELECT 1) SELECT * FROM a', 'b'],
    ['TABLE pg_roles', 'pg_roles'],
    ['SELECT * FROM transactions UNION SELECT * FROM auth.users', 'auth.users'],
    ['SELECT * FROM notifications', 'notifications'],
    ['SELECT * FROM public.notifications', 'public.notifications'],
    ['SELECT * FROM mycatalog.public.transactions', 'mycatalog.public.transactions'],
    ['SELECT (SELECT count(*) FROM jobs)', 'jobs'],
    ['SELECT * FROM transactions ORDER BY (SELECT 1 FROM email_sends LIMIT 1)', 'email_sends'],
    ['SELECT * FROM transactions WHERE EXISTS (SELECT 1 FROM user_settings)', 'user_settings'],
    ['SELECT * FROM transactions TABLESAMPLE SYSTEM (10) JOIN user_feedback ON true', 'user_feedback'],
    ['SELECT * FROM xmltable(\'/a\' PASSING xmlparse(document \'<a/>\') COLUMNS x int)', 'xmltable'],
  ])('rejects table bypass: %s', async (sql, expected) => {
    const result = await validateSelectSql(sql);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Disallowed tables');
    expect(result.error).toContain(expected);
  });

  it.each([
    'SELECT pg_sleep(10)',
    'SELECT id FROM transactions WHERE pg_sleep(5) IS NULL',
    "SELECT set_config('role', 'postgres', false)",
    "SELECT current_setting('request.jwt.claims')",
    "SELECT pg_read_file('/etc/passwd')",
    "SELECT pg_read_binary_file('/etc/passwd')",
    "SELECT * FROM pg_ls_dir('.')",
    "SELECT dblink_connect('host=evil')",
    "SELECT lo_import('/etc/passwd')",
    'SELECT pg_terminate_backend(1)',
    "SELECT query_to_xml('select * from pg_roles', true, true, '')",
    // Beyond the Python fixtures.
    'SELECT pg_catalog.pg_sleep(1)',
    'SELECT "pg_sleep"(1)',
    "SELECT nextval('s')",
    "SELECT setval('s', 1)",
    "SELECT has_table_privilege('transactions', 'select')",
    'SELECT txid_current()',
    "SELECT table_to_xml('transactions', true, false, '')",
    'SELECT ts_stat($$select 1$$)',
    "SELECT * FROM ROWS FROM (generate_series(1, 3), pg_sleep(1))",
    'SELECT * FROM transactions t, LATERAL pg_ls_dir(t.note)',
    "SELECT transactions_period_summary('00000000-0000-0000-0000-000000000000', now(), now())",
    'SELECT update_category_with_budget(1)',
    'SELECT auth.uid()',
    'SELECT extensions.http_get(1)',
    "SELECT http_get('http://169.254.169.254')",
    "SELECT 'pg_roles'::regclass",
    'SELECT 10::regrole',
    "SELECT CAST('x' AS pg_catalog.regprocedure)",
  ])('rejects a denied function: %s', async (sql) => {
    const result = await validateSelectSql(sql);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Forbidden function|Disallowed tables/);
  });

  it.each([
    'SELECT 1; SELECT 2',
    'SELECT id FROM transactions; DROP TABLE users',
    'WITH d AS (DELETE FROM transactions RETURNING *) SELECT * FROM d',
    "WITH u AS (UPDATE users SET email = 'x' RETURNING *) SELECT * FROM u",
    "WITH i AS (INSERT INTO budgets (user_id) VALUES ('x') RETURNING *) SELECT * FROM i",
    'SELECT id FROM transactions FOR UPDATE',
    'SELECT id FROM transactions FOR SHARE',
    'SELECT * INTO backup FROM transactions',
    'SET ROLE postgres',
    'SELEC garbage (',
    'EXPLAIN SELECT 1',
    'COPY transactions TO STDOUT',
    'BEGIN; SELECT 1',
    'CREATE TABLE x (a int)',
    'DROP TABLE transactions',
    'TRUNCATE transactions',
    'SHOW ALL',
    'RESET ALL',
    'DO $$ BEGIN PERFORM 1; END $$',
    'CALL some_proc()',
    'LOCK TABLE transactions',
    'VACUUM',
  ])('rejects a non-read-only or malformed statement: %s', async (sql) => {
    expect((await validateSelectSql(sql)).ok).toBe(false);
  });

  it('reports a forbidden keyword before a forbidden function before a table (Python priority)', async () => {
    expect((await validateSelectSql('SELECT pg_sleep(1) FROM pg_roles FOR UPDATE')).error).toContain('Forbidden SQL keyword');
    expect((await validateSelectSql('SELECT pg_sleep(1) FROM pg_roles')).error).toContain('Forbidden function');
  });

  it('rejects a null byte and oversized SQL before parsing', async () => {
    expect((await validateSelectSql('SELECT 1 FROM transactions\u0000; DROP TABLE x')).error).toContain('null byte');
    expect((await validateSelectSql(`SELECT ${'1,'.repeat(11_000)}1`)).error).toContain('too long');
  });

  it('cannot be tricked by comments, string literals or dollar quoting', async () => {
    // The semicolon and keywords inside literals are just data...
    const literal = await validateSelectSql("SELECT id FROM transactions WHERE note = '; DROP TABLE users; --'");
    expect(literal.ok).toBe(true);
    const dollar = await validateSelectSql("SELECT $q$'; DROP TABLE users; --$q$ AS x FROM transactions");
    expect(dollar.ok).toBe(true);
    // ...but a comment cannot hide a real second statement or swallow the wrapper.
    expect((await validateSelectSql('SELECT 1 /* ; */ ; DROP TABLE users')).ok).toBe(false);
    const commented = await validateSelectSql('SELECT id FROM transactions --');
    expect(commented.ok).toBe(true);
    expect(commented.sql).toContain('\n) AS _q LIMIT 500');
    expect((await validateSelectSql('SELECT 1 FROM transactions /* unterminated')).ok).toBe(false);
  });

  it('reports Postgres syntax errors', async () => {
    const result = await validateSelectSql('SELECT FROM WHERE');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/^Could not parse SQL: /);
  });
});
