import { describe, expect, it } from 'vitest';

import { buildBlocks, buildDeepLink, collectEntityNames } from '../src/features/agent/blocks';
import { validateMiniChart } from '../src/features/agent/chart';
import { validateDeepLink } from '../src/features/agent/deep-link';
import type { ToolResult } from '../src/features/agent/template';
import { MAX_DAILY_DAYS, TOOLS, TOOL_BY_NAME, TOOL_NAMES, TOOL_SPECS, ToolArgError, parseEntityMatches } from '../src/features/agent/tools';
import type { Prepared } from '../src/features/agent/tools';
import { NOW } from './agent-fixtures';

const ctx = { tz: 'Asia/Kolkata', nowMs: NOW };
const prepare = (name: string, args: unknown): Prepared => {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) throw new Error(`no tool ${name}`);
  return tool.prepare(typeof args === 'string' ? args : JSON.stringify(args), ctx);
};
const sqlOf = (name: string, args: unknown) => {
  const p = prepare(name, args);
  return { ...p, shape: (raw: unknown) => p.shape(raw, []) };
};

const CAT = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';

describe('tool definitions', () => {
  it('exposes the nine tools of the design with JSON Schemas generated from the zod schemas', () => {
    expect(TOOLS.map((t) => t.name)).toEqual([...TOOL_NAMES]);
    expect(TOOL_SPECS).toHaveLength(9);
    for (const spec of TOOL_SPECS) {
      expect(spec.type).toBe('function');
      expect(spec.function.description.length).toBeGreaterThan(20);
      const params = spec.function.parameters as { type: string; properties: Record<string, unknown>; $schema?: string };
      expect(params.type).toBe('object');
      expect(params.$schema).toBeUndefined();
      expect(Object.keys(params.properties).length).toBeGreaterThan(0);
    }
    const summary = TOOL_SPECS.find((t) => t.function.name === 'spending_summary')?.function.parameters as { required: string[]; properties: Record<string, { pattern?: string }> };
    expect(summary.required).toEqual(['from', 'to']);
    expect(summary.properties['from']?.pattern).toBe('^\\d{4}-\\d{2}-\\d{2}$');
    const list = TOOL_SPECS.find((t) => t.function.name === 'list_transactions')?.function.parameters as { properties: Record<string, { maximum?: number; enum?: string[] }> };
    expect(list.properties['limit']?.maximum).toBe(20);
    expect(list.properties['order']?.enum).toEqual(['date_desc', 'date_asc', 'amount_desc', 'amount_asc']);
    // The static prefix is stable: generating the specs twice gives byte-identical output.
    expect(JSON.stringify(TOOL_SPECS)).toBe(JSON.stringify(TOOLS.map((t) => t.spec)));
  });

  it('never offers a way to read notes or to run free-form SQL', () => {
    const list = TOOL_SPECS.find((t) => t.function.name === 'list_transactions')?.function.description ?? '';
    expect(list).toContain('Notes are never returned');
    expect(TOOL_SPECS.map((t) => t.function.name)).not.toContain('run_sql');
    expect(JSON.stringify(TOOL_SPECS)).not.toMatch(/\bSELECT\b/);
  });
});

describe('argument validation', () => {
  it('rejects malformed JSON, wrong types, bad dates and unknown enum values with readable messages', () => {
    expect(() => prepare('spending_summary', '{oops')).toThrow(/not valid JSON/);
    expect(() => prepare('spending_summary', { from: '2026-02-30', to: '2026-03-01' })).toThrow(/from: not a real calendar date/);
    expect(() => prepare('spending_summary', { from: '2026-6-1', to: '2026-06-30' })).toThrow(/from: use the format YYYY-MM-DD/);
    expect(() => prepare('spending_summary', { to: '2026-06-30' })).toThrow(ToolArgError);
    expect(() => prepare('spending_summary', { from: '2026-06-01', to: '2026-06-30', category_id: 'food' })).toThrow(/category_id/);
    expect(() => prepare('top_payees', { from: '2026-06-01', to: '2026-06-30', limit: 50 })).toThrow(/limit/);
    expect(() => prepare('list_transactions', { from: '2026-06-01', to: '2026-06-30', order: 'random' })).toThrow(/order/);
    expect(() => prepare('compare_periods', { a: { from: '2026-07-01', to: '2026-07-31' } })).toThrow(/b/);
    expect(() => prepare('resolve_entities', { text: 'x' })).toThrow(/text/);
  });

  it('rejects reversed ranges and daily_cashflow above 40 days with guidance', () => {
    expect(() => prepare('spending_summary', { from: '2026-06-30', to: '2026-06-01' })).toThrow(/is before "from"/);
    expect(() => prepare('daily_cashflow', { from: '2026-06-01', to: '2026-07-10' })).not.toThrow(); // exactly 40 days
    expect(() => prepare('daily_cashflow', { from: '2026-06-01', to: '2026-07-11' })).toThrow(new RegExp(`at most ${MAX_DAILY_DAYS} days`));
    expect(() => prepare('spending_summary', { from: '2020-01-01', to: '2026-06-30' })).toThrow(/maximum is 1100/);
  });

  it('accepts an empty argument object only where every field is optional', () => {
    expect(prepare('budget_status', '').call.name).toBe('budget_status');
    expect(() => prepare('daily_cashflow', '')).toThrow(ToolArgError);
  });
});

describe('planning: half-open UTC instants and typed query parameters', () => {
  it('converts inclusive local dates to [from 00:00, to+1 00:00)', () => {
    const p = sqlOf('spending_summary', { from: '2026-06-01', to: '2026-06-30', category_id: CAT, payee_key: 'swiggy' });
    expect(p.call).toEqual({ name: 'spending_summary', params: { from: '2026-05-31T18:30:00.000Z', to: '2026-06-30T18:30:00.000Z', categoryId: CAT, payeeKey: 'swiggy' } });
    expect(p.args).toMatchObject({ from: '2026-06-01', to: '2026-06-30', category_id: CAT, payee_key: 'swiggy' });
  });

  it('plans every data tool onto its query', () => {
    const range = { from: '2026-06-01', to: '2026-06-14' };
    const at = { from: '2026-05-31T18:30:00.000Z', to: '2026-06-14T18:30:00.000Z' };
    expect(sqlOf('category_breakdown', range).call).toEqual({ name: 'category_breakdown', params: { ...at, type: 'debit' } });
    expect(sqlOf('top_payees', range).call).toEqual({ name: 'top_payees', params: { ...at, categoryId: null, limit: 5 } });
    expect(sqlOf('daily_cashflow', range).call).toEqual({ name: 'daily_cashflow', params: { ...at, tz: 'Asia/Kolkata' } });
    const compare = sqlOf('compare_periods', { a: { from: '2026-07-01', to: '2026-07-31' }, b: { from: '2026-06-01', to: '2026-06-30' }, by: 'category' });
    expect(compare.call).toEqual({
      name: 'compare_periods',
      params: { a: { from: '2026-06-30T18:30:00.000Z', to: '2026-07-31T18:30:00.000Z' }, b: { from: '2026-05-31T18:30:00.000Z', to: '2026-06-30T18:30:00.000Z' }, by: 'category' },
    });
    const list = sqlOf('list_transactions', { ...range, min_amount: 5000, type: 'debit', order: 'amount_desc', limit: 3, payee_key: 'uber' });
    expect(list.call).toEqual({ name: 'list_transactions', params: { ...at, tz: 'Asia/Kolkata', categoryId: null, payeeKey: 'uber', minCents: 500000, type: 'debit', order: 'amount_desc', limit: 3 } });
    expect(sqlOf('resolve_entities', { text: 'Swigy' }).call).toEqual({ name: 'resolve_entities', params: { phrases: ['Swigy'] } });
  });

  it('turns rupee bounds into whole cents the way the user means them (min rounds up, max rounds down)', () => {
    const params = (args: unknown) => sqlOf('aggregate_transactions', { from: '2026-06-01', to: '2026-06-14', metric: 'count', ...(args as object) }).call.params as { minCents: number | null; maxCents: number | null };
    expect(params({ min_amount: 199.999, max_amount: 199.999 })).toMatchObject({ minCents: 20000, maxCents: 19999 });
    expect(params({ min_amount: 0.1, max_amount: 200 })).toMatchObject({ minCents: 10, maxCents: 20000 });
    expect(params({})).toMatchObject({ minCents: null, maxCents: null });
  });

  it('budget_status uses the calendar month containing `at` (default today), in the user timezone', () => {
    expect(sqlOf('budget_status', { at: '2026-02-17' }).call.params).toEqual({ from: '2026-01-31T18:30:00.000Z', to: '2026-02-28T18:30:00.000Z' });
    const today = sqlOf('budget_status', {});
    expect(today.call.params).toEqual({ from: '2026-09-30T18:30:00.000Z', to: '2026-10-31T18:30:00.000Z' });
    expect(today.args).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('aggregate_transactions validates its arguments and defaults to one spending number', () => {
    const p = sqlOf('aggregate_transactions', { from: '2026-07-01', to: '2026-07-31', metric: 'avg' });
    expect(p.call).toEqual({
      name: 'aggregate_transactions',
      params: { from: '2026-06-30T18:30:00.000Z', to: '2026-07-31T18:30:00.000Z', tz: 'Asia/Kolkata', metric: 'avg', groupBy: 'none', type: 'debit', category: null, payee: null, minCents: null, maxCents: null },
    });
    expect(() => prepare('aggregate_transactions', { from: '2026-07-01', to: '2026-07-31' })).toThrow(/metric/);
    expect(() => prepare('aggregate_transactions', { from: '2026-07-01', to: '2026-07-31', metric: 'median' })).toThrow(/metric/);
    expect(() => prepare('aggregate_transactions', { from: '2026-07-01', to: '2026-07-31', metric: 'sum', group_by: 'year' })).toThrow(/group_by/);
    expect(() => prepare('aggregate_transactions', { from: '2026-07-01', to: '2026-07-31', metric: 'sum', type: 'refund' })).toThrow(/type/);
    expect(() => prepare('aggregate_transactions', { from: '2026-07-01', to: '2026-07-31', metric: 'sum', min_amount: -5 })).toThrow(/min_amount/);
    expect(() => prepare('aggregate_transactions', { from: '2026-07-01', to: '2026-07-31', metric: 'sum', min_amount: 10, max_amount: 5 })).toThrow(/above max_amount/);
  });
});

describe('shaping results', () => {
  it('adds string amounts with Indian display twins and the period; counts rows', () => {
    const out = sqlOf('spending_summary', { from: '2026-06-01', to: '2026-06-30' }).shape({ debit: 1234567.5, credit: 0, net: -1234567.5, debit_count: 3, credit_count: 0, count: 3 });
    expect(out.rows).toBe(3);
    expect(out.data).toMatchObject({
      period: { from: '2026-06-01', to: '2026-06-30' },
      debit: '1234567.50',
      debit_display: '₹12,34,567.50',
      credit_display: '₹0',
      net: '-1234567.50',
      net_display: '-₹12,34,567.50',
      debit_count: 3,
    });
  });

  it('keeps per-day series as plain numbers and decorates the totals', () => {
    const out = sqlOf('daily_cashflow', { from: '2026-06-01', to: '2026-06-03' }).shape({ debit_total: 300, credit_total: 0, active_days: 2, peak_debit_day: { date: '2026-06-02', debit: 200 }, days: [{ date: '2026-06-01', debit: 100, credit: 0 }, { date: '2026-06-02', debit: 200, credit: 0 }] });
    expect(out.rows).toBe(2);
    expect(out.data['debit_total_display']).toBe('₹300');
    expect((out.data['peak_debit_day'] as Record<string, unknown>)['debit_display']).toBe('₹200');
    expect(out.data['days']).toEqual([{ date: '2026-06-01', debit: 100, credit: 0 }, { date: '2026-06-02', debit: 200, credit: 0 }]);
  });

  it('aggregate_transactions: money values for sum / avg, plain numbers for counts', () => {
    const avg = sqlOf('aggregate_transactions', { from: '2026-07-01', to: '2026-07-31', metric: 'avg', group_by: 'weekday' }).shape({
      metric: 'avg',
      group_by: 'weekday',
      groups: 2,
      rows: [{ group: 'Wednesday', value: 1234.5, count: 4 }, { group: 'Monday', value: 99, count: 1 }],
    });
    expect(avg.rows).toBe(2);
    expect(avg.data).toMatchObject({
      period: { from: '2026-07-01', to: '2026-07-31' },
      type: 'debit',
      rows: [
        { group: 'Wednesday', value: '1234.50', value_display: '₹1,234.50', count: 4 },
        { group: 'Monday', value: '99.00', value_display: '₹99', count: 1 },
      ],
    });
    const count = sqlOf('aggregate_transactions', { from: '2026-07-01', to: '2026-07-31', metric: 'count_distinct_payees' }).shape({ metric: 'count_distinct_payees', group_by: 'none', groups: 1, rows: [{ group: 'all', value: 26, count: 40 }] });
    expect(count.data['rows']).toEqual([{ group: 'all', value: 26, count: 40 }]);
  });

  it('ranks resolved entities: exact first, one row per entity, five at most', () => {
    const raw = {
      matches: [
        { phrase: 'swiggy', type: 'payee', id: 'swiggy', name: 'Swiggy', score: 1, similarity: 1, txn_count: 30 },
        { phrase: 'swiggy', type: 'payee', id: 'swiggy instamart', name: 'Swiggy Instamart', score: 1, similarity: 0.5, txn_count: 18 },
        { phrase: 'swiggy orders', type: 'payee', id: 'swiggy', name: 'Swiggy', score: 0.7, similarity: 0.4, txn_count: 30 },
        { phrase: 'swiggy', type: 'category', id: CAT, name: 'Food', score: 0.55, similarity: 0.2, txn_count: 0 },
      ],
    };
    const out = sqlOf('resolve_entities', { text: 'swiggy' }).shape(raw);
    expect(out.data['matches']).toEqual([
      { type: 'payee', id: 'swiggy', name: 'Swiggy', score: 1, exact: true, txn_count: 30 },
      { type: 'payee', id: 'swiggy instamart', name: 'Swiggy Instamart', score: 1, exact: false, txn_count: 18 },
      { type: 'category', id: CAT, name: 'Food', score: 0.55, exact: false },
    ]);
    expect(parseEntityMatches(raw)).toHaveLength(4);
    expect(parseEntityMatches('nonsense')).toEqual([]);
  });
});

const res = (name: ToolResult['name'], data: Record<string, unknown>, args: Record<string, unknown> = {}): ToolResult => ({ name, args, ok: true, data, error: null, ms: 1, rows: 1 });

describe('charts and deep links come from tool results', () => {
  it('draws a donut from a category breakdown (with the Other bucket) and nothing for a single category', () => {
    const data = {
      type: 'debit',
      period: { from: '2026-06-01', to: '2026-06-30' },
      categories: [{ category_id: CAT, name: 'Food', total: '600.00' }, { name: 'Rent', total: '400.00' }],
      other: { total: '50.00' },
    };
    expect(buildBlocks([res('category_breakdown', data)])[0]).toEqual({
      type: 'mini_chart',
      chart_kind: 'donut',
      payload: { title: 'Spending by category', series: [{ name: 'Food', value: 600 }, { name: 'Rent', value: 400 }, { name: 'Other', value: 50 }] },
    });
    expect(buildBlocks([res('category_breakdown', { ...data, categories: [{ name: 'Food', total: '600.00' }], other: undefined })])).toEqual([]);
  });

  it('draws a zero-filled cashflow chart for daily_cashflow', () => {
    const blocks = buildBlocks([
      res('daily_cashflow', { period: { from: '2026-06-01', to: '2026-06-04' }, debit_total: 300, days: [{ date: '2026-06-02', debit: 100, credit: 0 }, { date: '2026-06-04', debit: 200, credit: 0 }] }),
    ]);
    expect(blocks[0]).toMatchObject({ chart_kind: 'cashflow' });
    expect((blocks[0] as unknown as { payload: { points: unknown } }).payload.points).toEqual([
      { date: '2026-06-01', amount: 0 },
      { date: '2026-06-02', amount: 100 },
      { date: '2026-06-03', amount: 0 },
      { date: '2026-06-04', amount: 200 },
    ]);
    expect(buildBlocks([res('daily_cashflow', { period: { from: '2026-06-01', to: '2026-06-04' }, debit_total: 0, days: [] })])).toEqual([]);
  });

  it('draws compare_bar for category comparisons and for totals, with readable period labels', () => {
    const base = { period_a: { from: '2026-07-01', to: '2026-07-31' }, period_b: { from: '2026-06-10', to: '2026-06-20' } };
    const byCategory = buildBlocks([res('compare_periods', { ...base, rows: [{ name: 'Food', a: '300.00', b: '250.00' }] })]);
    expect((byCategory[0] as unknown as { payload: unknown }).payload).toEqual({ title: 'Jul 2026 vs 10 Jun – 20 Jun', period_a_label: 'Jul 2026', period_b_label: '10 Jun – 20 Jun', compare_series: [{ name: 'Food', period_a: 300, period_b: 250 }] });
    const totals = buildBlocks([res('compare_periods', { ...base, a: { debit: '900.00', credit: '0.00' }, b: { debit: '700.00', credit: '100.00' } })]);
    expect((totals[0] as unknown as { payload: { compare_series: unknown } }).payload.compare_series).toEqual([{ name: 'Spent', period_a: 900, period_b: 700 }, { name: 'Income', period_a: 0, period_b: 100 }]);
  });

  it('uses only the last drawable result and ignores failed ones', () => {
    const failed: ToolResult = { ...res('category_breakdown', {}), ok: false, data: null };
    const donut = res('top_payees', { payees: [{ name: 'A', total: '10.00' }, { name: 'B', total: '5.00' }] });
    expect(buildBlocks([donut, failed, res('spending_summary', {})])).toHaveLength(1);
    expect(buildBlocks([failed])).toEqual([]);
  });

  it('builds a payee / category / day deep link only from arguments plus names the turn knows, and validates it', () => {
    const results = [
      res('top_payees', { payees: [{ payee_key: 'swiggy', name: 'Swiggy' }, { payee_key: 'zomato', name: 'Zomato' }] }, { from: '2026-06-01', to: '2026-06-30' }),
      res('spending_summary', { count: 5 }, { from: '2026-06-01', to: '2026-06-30', payee_key: 'swiggy' }),
    ];
    const names = collectEntityNames(results, []);
    expect(buildDeepLink(results, names, 'Asia/Kolkata')).toEqual({
      screen: 'TransactionsList',
      label: 'View Swiggy',
      params: {
        filter: 'payee',
        year: 2026,
        monthIndex0: 5,
        payeeId: 'swiggy',
        payeeKey: 'swiggy',
        payeeDisplayName: 'Swiggy',
        payeeKeysTop: ['swiggy', 'zomato'],
        fromIso: '2026-06-01T00:00:00+05:30',
        toIso: '2026-06-30T23:59:59.999999+05:30',
      },
    });

    const cat = [res('spending_summary', {}, { from: '2026-06-01', to: '2026-06-30', category_id: CAT })];
    expect(buildDeepLink(cat, collectEntityNames(cat, [{ type: 'category', id: CAT, name: 'Food', exact: true }]), 'Asia/Kolkata')).toMatchObject({ params: { filter: 'category', categoryId: CAT, categoryDisplayName: 'Food' } });
    // An id whose name is unknown never becomes a link.
    expect(buildDeepLink(cat, collectEntityNames(cat, []), 'Asia/Kolkata')).toBeNull();

    const day = [res('list_transactions', { rows: [] }, { from: '2026-06-12', to: '2026-06-12' })];
    expect(buildDeepLink(day, new Map(), 'Asia/Kolkata')).toEqual({ screen: 'TransactionsList', label: 'View this day', params: { filter: 'day', year: 2026, monthIndex0: 5, dayKey: '2026-06-12' } });
    expect(buildDeepLink([res('category_breakdown', {}, { from: '2026-06-01', to: '2026-06-30' })], new Map(), 'Asia/Kolkata')).toBeNull();
  });

  it('chart and deep link validators still reject malformed payloads', () => {
    expect(validateMiniChart({ chart_kind: 'donut', payload: { series: [{ name: 'x', value: 0 }] } })).toBeNull();
    expect(validateMiniChart({ chart_kind: 'compare_bar', payload: { compare_series: [{ name: 'a', period_a: 1, period_b: 2 }] } })?.payload.period_a_label).toBe('Period A');
    expect(validateDeepLink({ params: { filter: 'category', year: 2026, monthIndex0: 5, categoryId: 'short', categoryDisplayName: 'x' } })).toBeNull();
    expect(validateDeepLink({ params: { filter: 'payee', year: 2026, monthIndex0: 5, payeeDisplayName: 'x' } })).toBeNull();
    expect(validateDeepLink('nope')).toBeNull();
  });
});
