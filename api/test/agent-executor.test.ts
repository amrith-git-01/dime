import { describe, expect, it } from 'vitest';

import { AgentDbUnavailableError, executeReadonlySql, executeToolCalls, isDbUnavailable, jsonSafe } from '../src/features/agent/sql-executor';
import type { SqlClient, SqlTx } from '../src/features/agent/sql-executor';

interface Recorded {
  options: string;
  statements: { query: string; params: readonly unknown[] | undefined }[];
}

type Row = Record<string, unknown>;

/** A postgres.js stand-in: records every statement of every transaction and scripts the SELECT result. */
function fakeSql(opts: { rows?: Row[]; fail?: (query: string) => Error | undefined } = {}) {
  const transactions: Recorded[] = [];
  const client: SqlClient = {
    begin: async <T>(options: string, fn: (tx: SqlTx) => Promise<T>): Promise<T> => {
      const record: Recorded = { options, statements: [] };
      transactions.push(record);
      const tx: SqlTx = {
        unsafe: (query, params) => {
          record.statements.push({ query, params });
          const failure = opts.fail?.(query);
          if (failure) return Promise.reject(failure);
          return Promise.resolve(query.startsWith('SELECT * FROM') ? (opts.rows ?? []) : []);
        },
      };
      return await fn(tx);
    },
    end: () => Promise.resolve(),
  };
  return { client, transactions };
}

const OPTIONS = { userId: '11111111-1111-1111-1111-111111111111', maxRows: 500, timeoutMs: 3000 };

describe('executeReadonlySql', () => {
  it('runs one READ ONLY transaction: jwt claims, role switch, statement timeout, then the wrapped query', async () => {
    const { client, transactions } = fakeSql({ rows: [{ total: 12.5 }] });
    const result = await executeReadonlySql(client, 'SELECT SUM(amount) AS total FROM transactions', OPTIONS);

    expect(transactions).toHaveLength(1);
    const [tx] = transactions as [Recorded];
    expect(tx.options).toBe('read only');
    expect(tx.statements.map((s) => s.query)).toEqual([
      "select set_config('request.jwt.claims', $1, true)",
      'set local role authenticated',
      "set local statement_timeout = '3000ms'",
      'SELECT * FROM (SELECT SUM(amount) AS total FROM transactions) AS _q LIMIT 500',
    ]);
    // The claims are a bound parameter (never interpolated) with the JWT subject and role.
    expect(tx.statements[0]?.params).toEqual([JSON.stringify({ sub: OPTIONS.userId, role: 'authenticated', aud: 'authenticated' })]);
    expect(tx.statements[3]?.params).toBeUndefined();
    expect(result).toMatchObject({ rows: [{ total: 12.5 }], row_count: 1, columns: ['total'], truncated: false, error: null });
  });

  it('never reaches the database for SQL the validator rejects', async () => {
    const { client, transactions } = fakeSql();
    for (const sql of ['DROP TABLE transactions', 'SELECT * FROM pg_roles', "SELECT pg_sleep(5)", 'SELECT 1; SELECT 2', '']) {
      const result = await executeReadonlySql(client, sql, OPTIONS);
      expect(result.error, sql).toBeTruthy();
      expect(result).toMatchObject({ rows: [], row_count: 0, columns: [], truncated: false });
    }
    expect(transactions).toHaveLength(0);
  });

  it('reports the validator error to the model', async () => {
    const { client } = fakeSql();
    expect((await executeReadonlySql(client, 'SELECT * FROM secret_table', OPTIONS)).error).toBe('Disallowed tables: secret_table');
  });

  it('flags truncation when the row cap is reached', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ n: i }));
    const { client, transactions } = fakeSql({ rows });
    const result = await executeReadonlySql(client, 'SELECT n FROM transactions', { ...OPTIONS, maxRows: 3 });
    expect(result.truncated).toBe(true);
    expect(transactions[0]?.statements[3]?.query).toMatch(/LIMIT 3$/);
  });

  it('returns database errors as text for the retry loop (like Python)', async () => {
    const { client } = fakeSql({
      fail: (q) => (q.startsWith('SELECT * FROM') ? Object.assign(new Error('column "nope" does not exist'), { name: 'PostgresError', code: '42703' }) : undefined),
    });
    const result = await executeReadonlySql(client, 'SELECT nope FROM transactions', OPTIONS);
    expect(result.error).toBe('PostgresError: column "nope" does not exist');
    expect(result.rows).toEqual([]);
  });

  it.each(['CONNECT_TIMEOUT', 'CONNECTION_CLOSED', 'ECONNREFUSED', '08006', '53300', '57P01'])('throws AgentDbUnavailableError for a %s failure', async (code) => {
    const { client } = fakeSql({ fail: () => Object.assign(new Error('boom'), { code }) });
    await expect(executeReadonlySql(client, 'SELECT 1 FROM transactions', OPTIONS)).rejects.toBeInstanceOf(AgentDbUnavailableError);
  });

  it.each(['connection attempt failed', 'Network connection lost.', 'write CONNECTION_CLOSED 10.0.0.1:5432', 'Hyperdrive error', 'read ECONNRESET'])(
    'a plain transport error (%s) is unavailability too',
    (message) => {
      expect(isDbUnavailable(new Error(message))).toBe(true);
    },
  );

  it('an error the database reported is never unavailability, whatever its text', () => {
    const fromServer = Object.assign(new Error('terminating connection due to administrator command'), { name: 'PostgresError', code: '42601' });
    expect(isDbUnavailable(fromServer)).toBe(false);
  });

  it('classifies only connection-level errors as unavailability', () => {
    expect(isDbUnavailable(Object.assign(new Error('x'), { code: '42703' }))).toBe(false);
    expect(isDbUnavailable(Object.assign(new Error('x'), { code: '57014' }))).toBe(false); // statement timeout: a query error
    expect(isDbUnavailable(new Error('plain'))).toBe(false);
    expect(isDbUnavailable(null)).toBe(false);
  });

  it('makes values JSON-safe like Python _json_safe', async () => {
    const at = new Date('2026-06-12T10:30:00.000Z');
    const { client } = fakeSql({
      rows: [{ at, whole: new Date('2026-06-12T00:00:00.000Z'), big: 9007199254740993n, text: 'x', nothing: null, n: 1.5 }],
    });
    const result = await executeReadonlySql(client, 'SELECT 1 FROM transactions', OPTIONS);
    expect(result.rows[0]).toEqual({
      at: '2026-06-12T10:30:00+00:00',
      whole: '2026-06-12T00:00:00+00:00',
      big: 9007199254740992,
      text: 'x',
      nothing: null,
      n: 1.5,
    });
    expect(JSON.stringify(result.rows)).toContain('2026-06-12T10:30:00+00:00');
  });
});

describe('jsonSafe', () => {
  it('formats dates with microsecond-free offsets, keeps milliseconds when present', () => {
    expect(jsonSafe(new Date('2026-06-12T10:30:00.250Z'))).toBe('2026-06-12T10:30:00.250+00:00');
    expect(jsonSafe(new Date('2026-06-12T10:30:00Z'))).toBe('2026-06-12T10:30:00+00:00');
    expect(jsonSafe(new Date('nope'))).toBeNull();
    expect(jsonSafe(5n)).toBe(5);
    expect(jsonSafe(new Uint8Array([1, 255]))).toBe('\\x01ff');
    expect(jsonSafe('s')).toBe('s');
  });
});

describe('executeToolCalls', () => {
  const calls = [
    { text: 'select public.agent_spending_summary($1::text::timestamptz) as r', params: ['2026-06-01T00:00:00Z'] as (string | null)[] },
    { text: 'select public.agent_top_payees($1::text::timestamptz) as r', params: [null] as (string | null)[] },
  ];

  function fakeStep(handler: (query: string) => Row[] | Error) {
    const statements: string[] = [];
    let transactions = 0;
    const client: SqlClient = {
      begin: async <T>(options: string, fn: (tx: SqlTx) => Promise<T>): Promise<T> => {
        transactions += 1;
        expect(options).toBe('read only');
        return await fn({
          unsafe: (query) => {
            statements.push(query);
            const out = handler(query);
            return out instanceof Error ? Promise.reject(out) : Promise.resolve(out);
          },
        });
      },
      end: () => Promise.resolve(),
    };
    return { client, statements, transactions: () => transactions };
  }

  it('pipelines the step in ONE transaction after the claims, role switch and timeout', async () => {
    const { client, statements, transactions } = fakeStep((q) => (q.includes('agent_spending_summary') ? [{ r: { debit: 1 } }] : q.includes('agent_top_payees') ? [{ r: { payees: [] } }] : []));
    const { results } = await executeToolCalls(client, OPTIONS.userId, calls, { timeoutMs: 2500 });
    expect(transactions()).toBe(1);
    expect(statements).toEqual([
      "select set_config('request.jwt.claims', $1, true)",
      'set local role authenticated',
      "set local statement_timeout = '2500ms'",
      calls[0]?.text,
      calls[1]?.text,
    ]);
    expect(results).toEqual([{ ok: true, value: { debit: 1 } }, { ok: true, value: { payees: [] } }]);
  });

  it('reports a failing call without hiding the others (and never leaks the database message)', async () => {
    const { client } = fakeStep((q) => (q.includes('agent_top_payees') ? new Error('canceling statement due to statement timeout') : [{ r: { debit: 1 } }]));
    const { results } = await executeToolCalls(client, OPTIONS.userId, calls, { timeoutMs: 2500 });
    expect(results[0]).toEqual({ ok: true, value: { debit: 1 } });
    expect(results[1]).toEqual({ ok: false, error: 'The query took too long. Try a shorter period.' });

    const aborted = fakeStep((q) => (q.includes('agent_spending_summary') ? new Error('current transaction is aborted, commands ignored until end of transaction block') : [{ r: 1 }]));
    const second = await executeToolCalls(aborted.client, OPTIONS.userId, calls, { timeoutMs: 2500 });
    expect(second.results[0]).toMatchObject({ ok: false });
    const other = fakeStep((q) => (q.includes('agent_spending_summary') ? new Error('relation "secret_table" does not exist') : [{ r: 1 }]));
    const third = await executeToolCalls(other.client, OPTIONS.userId, calls, { timeoutMs: 2500 });
    expect(JSON.stringify(third.results[0])).not.toContain('secret_table');
  });

  it('throws AgentDbUnavailableError when the connection is gone', async () => {
    const { client } = fakeStep(() => Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));
    await expect(executeToolCalls(client, OPTIONS.userId, calls, { timeoutMs: 2500 })).rejects.toBeInstanceOf(AgentDbUnavailableError);
  });

  it('fails the step when the role switch itself fails', async () => {
    const { client } = fakeStep((q) => (q === 'set local role authenticated' ? new Error('permission denied to set role "authenticated"') : []));
    await expect(executeToolCalls(client, OPTIONS.userId, calls, { timeoutMs: 2500 })).rejects.toThrow(/permission denied/);
  });
});
