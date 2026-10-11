import { describe, expect, it } from 'vitest';

import { validateDeepLink } from '../src/features/agent/deep-link';
import { newTurnState } from '../src/features/agent/state';
import { MAX_SQL_PER_TURN, TOOLS, TOOL_BY_NAME, TOOL_NAMES, TOOL_SPECS, ToolArgError } from '../src/features/agent/tools';
import type { ToolContext, ToolOutcome } from '../src/features/agent/tools';
import { fakeQueries, sqlError, sqlOk } from './agent-fixtures';
import type { FakeQueries } from './agent-fixtures';
import { testDb, USER_ID } from './db';

function setup(handlers: Parameters<typeof fakeQueries>[0] = {}, opts: Parameters<typeof fakeQueries>[1] = {}) {
  const fake: FakeQueries = fakeQueries(handlers, opts);
  const state = newTurnState();
  const ctx: ToolContext = { db: testDb(), userId: USER_ID, tz: 'Asia/Kolkata', tzOffsetMinutes: 330, signal: new AbortController().signal, queries: fake.queries, state };
  const call = async (name: string, args: unknown): Promise<{ label: string; out: ToolOutcome }> => {
    const tool = TOOL_BY_NAME.get(name);
    if (!tool) throw new Error(`no tool ${name}`);
    const prepared = tool.prepare(typeof args === 'string' ? args : JSON.stringify(args), ctx);
    return { label: prepared.label, out: await prepared.run() };
  };
  return { fake, state, ctx, call };
}
const argError = (fn: () => unknown): string => {
  try {
    fn();
  } catch (err) {
    if (err instanceof ToolArgError) return err.message;
    throw err;
  }
  throw new Error('expected a ToolArgError');
};
const prepare = (name: string, args: unknown, ctx: ToolContext) => TOOL_BY_NAME.get(name)?.prepare(typeof args === 'string' ? args : JSON.stringify(args), ctx);

const CAT = '85bf877a-f8b1-4b07-a9fb-5e8c809907ae';

describe('tool definitions', () => {
  it('exposes the four tools with JSON Schemas generated from the zod schemas', () => {
    expect(TOOLS.map((t) => t.name)).toEqual([...TOOL_NAMES]);
    expect(TOOL_NAMES).toEqual(['run_sql', 'find_entities', 'link_transactions', 'show_chart']);
    for (const spec of TOOL_SPECS) {
      expect(spec.type).toBe('function');
      expect(spec.function.description.length).toBeGreaterThan(40);
      const params = spec.function.parameters as { type: string; properties: Record<string, unknown>; $schema?: string };
      expect(params.type).toBe('object');
      expect(params.$schema).toBeUndefined();
    }
    const sql = TOOL_SPECS.find((t) => t.function.name === 'run_sql')?.function.parameters as { required: string[]; properties: Record<string, unknown> };
    expect(sql.required).toEqual(['sql']);
    expect(Object.keys(sql.properties)).toEqual(['sql', 'purpose']);
    const chart = TOOL_SPECS.find((t) => t.function.name === 'show_chart')?.function.parameters as { required: string[] };
    expect(chart.required).toEqual(['kind', 'title', 'result_id', 'label_column', 'value_columns']);
  });
});

describe('argument validation', () => {
  it('turns bad JSON and schema errors into messages the model can act on', () => {
    const { ctx } = setup();
    expect(argError(() => prepare('run_sql', '{not json', ctx))).toContain('not valid JSON');
    expect(argError(() => prepare('run_sql', '{}', ctx))).toContain('sql:');
    expect(argError(() => prepare('run_sql', '{"sql": ""}', ctx))).toContain('sql:');
    expect(argError(() => prepare('find_entities', '{"phrases": []}', ctx))).toContain('phrases');
    expect(argError(() => prepare('find_entities', '{"phrases": ["a"]}', ctx))).toContain('phrases');
    expect(argError(() => prepare('show_chart', '{"kind":"pie"}', ctx))).toContain('kind');
  });
});

describe('run_sql', () => {
  it('runs the query for the verified user with the turn offset and returns columns, rows and a result id', async () => {
    const { call, fake, state } = setup({ run_sql: sqlOk(['spent'], [[18388.5]]) });
    const { label, out } = await call('run_sql', { sql: 'SELECT 1', purpose: 'Totalling June' });
    expect(label).toBe('Totalling June');
    expect(out).toEqual({ data: { result_id: 'r1', columns: ['spent'], rows: [[18388.5]], row_count: 1, truncated: false }, error: null, rows: 1, sqlChars: 8 });
    expect(fake.calls()).toEqual([{ name: 'run_sql', params: { sql: 'SELECT 1', tzOffsetMinutes: 330, signal: expect.any(AbortSignal) as AbortSignal } }]);
    expect(state.runs).toEqual([{ id: 'r1', columns: ['spent'], rows: [[18388.5]], shown: 1, truncated: false }]);
  });

  it('uses a default label without a purpose, numbers results in call order and reports SQLite errors', async () => {
    const { call, state } = setup({ run_sql: (p: { sql: string }) => (p.sql === 'bad' ? sqlError('no such column: foo') : sqlOk(['n'], [[1]])) });
    expect((await call('run_sql', { sql: 'bad' })).label).toBe('Looking at your transactions');
    const bad = await call('run_sql', { sql: 'bad' });
    expect(bad.out).toEqual({ data: null, error: 'no such column: foo', rows: 0, sqlChars: 3 });
    const good = await call('run_sql', { sql: 'ok' });
    expect(good.out.data).toMatchObject({ result_id: 'r3' });
    expect(state.runs.map((r) => r.id)).toEqual(['r3']); // failed attempts keep their number but store nothing
  });

  it('shows the model at most 50 rows and says so; the whole result stays for charts', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => [i]);
    const { call, state } = setup({ run_sql: sqlOk(['i'], rows) });
    const { out } = await call('run_sql', { sql: 'SELECT i' });
    expect((out.data?.['rows'] as unknown[]).length).toBe(50);
    expect(out.data).toMatchObject({ row_count: 120, rows_shown: 50, truncated: false });
    expect(String(out.data?.['note'])).toContain('first rows');
    expect(state.runs[0]).toMatchObject({ shown: 50 });
    expect(state.runs[0]?.rows).toHaveLength(120);
  });

  it('keeps a huge row from flooding the prompt (about 6 000 characters shown)', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => [`${i}-${'x'.repeat(400)}`]);
    const { call, state } = setup({ run_sql: sqlOk(['s'], rows) });
    const { out } = await call('run_sql', { sql: 'SELECT s' });
    const shown = (out.data?.['rows'] as unknown[]).length;
    expect(shown).toBeGreaterThan(5);
    expect(shown).toBeLessThan(20);
    expect(state.runs[0]?.shown).toBe(shown);
  });

  it('flags a result cut at 200 rows', async () => {
    const { call } = setup({ run_sql: sqlOk(['i'], Array.from({ length: 200 }, (_, i) => [i]), true) });
    const { out } = await call('run_sql', { sql: 'SELECT i' });
    expect(out.data).toMatchObject({ truncated: true, row_count: 200 });
    expect(String(out.data?.['note'])).toContain('200 rows');
  });

  it('allows only MAX_SQL_PER_TURN queries per question', () => {
    const { ctx } = setup();
    for (let i = 0; i < MAX_SQL_PER_TURN; i++) prepare('run_sql', { sql: 'SELECT 1' }, ctx);
    expect(argError(() => prepare('run_sql', { sql: 'SELECT 1' }, ctx))).toContain(`At most ${MAX_SQL_PER_TURN} queries`);
  });
});

describe('find_entities', () => {
  it('returns named keys, remembers the entities and passes the phrases through', async () => {
    const { call, state, fake } = setup({
      resolve_entities: {
        matches: [
          { phrase: 'swiggy', type: 'payee', id: 'swiggy', name: 'Swiggy', score: 1, similarity: 1, txn_count: 4 },
          { phrase: 'food', type: 'category', id: CAT, name: 'Food & Dining', score: 0.8, similarity: 0.5 },
        ],
      },
    });
    const { label, out } = await call('find_entities', { phrases: ['swiggy', 'food'] });
    expect(label).toBe('Looking up payees and categories');
    expect(out.data).toEqual({
      matches: [
        { type: 'payee', payee_key: 'swiggy', name: 'Swiggy', txn_count: 4, score: 1, exact: true },
        { type: 'category', category_id: CAT, name: 'Food & Dining', score: 0.8, exact: false },
      ],
    });
    expect(fake.calls()[0]?.params).toEqual({ phrases: ['swiggy', 'food'] });
    expect(state.entities).toEqual([
      { type: 'payee', id: 'swiggy', name: 'Swiggy' },
      { type: 'category', id: CAT, name: 'Food & Dining' },
    ]);
  });
});

describe('link_transactions', () => {
  const june = { from: '2026-06-01', to: '2026-06-30' };

  it('builds the payee deep link from the database name, never from model text', async () => {
    const { call, state, fake } = setup({ link_target: { name: 'Swiggy' } });
    const { out } = await call('link_transactions', { filter: 'payee', payee_key: 'swiggy', ...june, label: 'View Swiggy' });
    expect(out.data).toEqual({ ok: true, label: 'View Swiggy' });
    expect(fake.calls()[0]?.params).toEqual({ filter: 'payee', id: 'swiggy' });
    expect(state.link).toEqual({
      screen: 'TransactionsList',
      label: 'View Swiggy',
      params: { filter: 'payee', year: 2026, monthIndex0: 5, payeeId: 'swiggy', payeeKey: 'swiggy', payeeDisplayName: 'Swiggy', payeeKeysTop: ['swiggy'], fromIso: '2026-06-01T00:00:00+05:30', toIso: '2026-06-30T23:59:59.999999+05:30' },
    });
    expect(validateDeepLink(state.link)).toEqual(state.link);
    expect(state.linkRange).toEqual(june);
    expect(state.entities).toEqual([{ type: 'payee', id: 'swiggy', name: 'Swiggy' }]);
  });

  it('category and day links; the default label names the thing', async () => {
    const category = setup({ link_target: { name: 'Food & Dining' } });
    await category.call('link_transactions', { filter: 'category', category_id: CAT, ...june });
    expect(category.state.link).toMatchObject({ label: 'View Food & Dining', params: { filter: 'category', categoryId: CAT, categoryDisplayName: 'Food & Dining', year: 2026, monthIndex0: 5 } });

    const day = setup();
    const { out } = await day.call('link_transactions', { filter: 'day', day: '2026-06-15' });
    expect(out.error).toBeNull();
    expect(day.state.link).toEqual({ screen: 'TransactionsList', label: 'View this day', params: { filter: 'day', year: 2026, monthIndex0: 5, dayKey: '2026-06-15' } });
    expect(day.fake.calls()).toEqual([]); // a day needs no lookup
    expect(day.state.linkRange).toBeNull();
  });

  it('refuses a payee or category that is not in the user data, and keeps the previous link', async () => {
    const { call, state } = setup({ link_target: (p: { filter: string }) => (p.filter === 'payee' ? null : { name: 'Food & Dining' }) });
    await call('link_transactions', { filter: 'category', category_id: CAT, ...june });
    const before = state.link;
    const bad = await call('link_transactions', { filter: 'payee', payee_key: 'someone else', ...june });
    expect(bad.out.error).toContain('No payee with payee_key');
    expect(state.link).toBe(before);
  });

  it('the last valid link wins', async () => {
    const { call, state } = setup({ link_target: { name: 'Swiggy' } });
    await call('link_transactions', { filter: 'day', day: '2026-06-15' });
    await call('link_transactions', { filter: 'payee', payee_key: 'swiggy', ...june });
    expect(state.link).toMatchObject({ params: { filter: 'payee' } });
  });

  it('validates the arguments by filter', () => {
    const { ctx } = setup();
    expect(argError(() => prepare('link_transactions', { filter: 'payee', ...june }, ctx))).toContain('payee_key');
    expect(argError(() => prepare('link_transactions', { filter: 'payee', payee_key: 'x' }, ctx))).toContain('from');
    expect(argError(() => prepare('link_transactions', { filter: 'category', ...june }, ctx))).toContain('category_id');
    expect(argError(() => prepare('link_transactions', { filter: 'day' }, ctx))).toContain('day');
    expect(argError(() => prepare('link_transactions', { filter: 'payee', payee_key: 'x', from: '2026-06-30', to: '2026-06-01' }, ctx))).toContain('after');
    expect(argError(() => prepare('link_transactions', { filter: 'day', day: '2026-02-30' }, ctx))).toContain('real calendar date');
  });

  it('fails cleanly when the link does not validate (a too-long name)', async () => {
    const { call, state } = setup({ link_target: { name: 'x'.repeat(200) } });
    const { out } = await call('link_transactions', { filter: 'payee', payee_key: 'x', ...june });
    expect(out.error).toContain('could not be built');
    expect(state.link).toBeNull();
  });
});

describe('show_chart', () => {
  const rowsResult = sqlOk(['category', 'total'], [['Rent', 9000], ['Food', 4000]]);

  it('draws from an earlier result id and attaches exactly one chart', async () => {
    const { call, state } = setup({ run_sql: rowsResult });
    await call('run_sql', { sql: 'SELECT 1' });
    const args = { kind: 'donut', title: 'Spending by category', result_id: 'r1', label_column: 'category', value_columns: ['total'] };
    const { label, out } = await call('show_chart', args);
    expect(label).toBe('Drawing a chart');
    expect(out).toEqual({ data: { ok: true, chart: 'donut' }, error: null, rows: 1 });
    expect(state.chart).toEqual({ type: 'mini_chart', chart_kind: 'donut', payload: { title: 'Spending by category', series: [{ name: 'Rent', value: 9000 }, { name: 'Food', value: 4000 }] } });

    const again = await call('show_chart', args);
    expect(again.out.error).toContain('Only one chart');
  });

  it('says which results exist when the id is wrong, and that same-step results are not ready', async () => {
    const { call } = setup({ run_sql: rowsResult });
    const none = await call('show_chart', { kind: 'donut', title: 'T', result_id: 'r1', label_column: 'a', value_columns: ['b'] });
    expect(none.out.error).toContain('Run a query first');
    await call('run_sql', { sql: 'SELECT 1' });
    const wrong = await call('show_chart', { kind: 'donut', title: 'T', result_id: 'r9', label_column: 'a', value_columns: ['b'] });
    expect(wrong.out.error).toContain('Available: r1');
    expect(wrong.out.error).toContain('next step');
  });

  it('passes column and data problems back to the model', async () => {
    const { call, state } = setup({ run_sql: rowsResult });
    await call('run_sql', { sql: 'SELECT 1' });
    const bad = await call('show_chart', { kind: 'donut', title: 'T', result_id: 'r1', label_column: 'category', value_columns: ['nope'] });
    expect(bad.out.error).toContain('Its columns: category, total');
    const tooFew = await call('show_chart', { kind: 'compare_bar', title: 'T', result_id: 'r1', label_column: 'category', value_columns: ['total'] });
    expect(tooFew.out.error).toContain('exactly two');
    expect(state.chart).toBeNull(); // a failed attempt does not use up the one chart
  });
});
