import { describe, expect, it } from 'vitest';

import { chartToBlock, deepLinkToDict, extractJsonObject, parseRespondJson, validateMiniChart } from '../src/features/agent/chart';
import { buildCompareBarBlock, buildCompareSeries, enrichCompareBlocks } from '../src/features/agent/compare-blocks';
import { enrichDeepLink, resolveDeepLinkIds, validateDeepLink } from '../src/features/agent/deep-link';
import type { MiniChartBlock } from '../src/features/agent/schemas';
import { extractSqlEntities } from '../src/features/agent/sql-entities';
import type { CompareRange, PackedRange, TimeRange } from '../src/features/agent/time-range';

/** Ports of test_compare_blocks.py, test_respond_parse.py, test_sql_entities.py and test_deep_link*.py. */

describe('compare blocks', () => {
  it('builds series from category rows', () => {
    const series = buildCompareSeries([
      { category_name: 'Food', period_a_amount: 6200, period_b_amount: 7800 },
      { category_name: 'Transport', period_a_amount: 3100, period_b_amount: 4200 },
    ]);
    expect(series).toEqual([
      { name: 'Food', period_a: 6200, period_b: 7800 },
      { name: 'Transport', period_a: 3100, period_b: 4200 },
    ]);
  });

  it('a single totals row is "Total spending"; rows without both periods are skipped', () => {
    expect(buildCompareSeries([{ period_a_total: 18388.35, period_b_total: 26643.94 }])).toEqual([
      { name: 'Total spending', period_a: 18388.35, period_b: 26643.94 },
    ]);
    expect(buildCompareSeries([{ period_a_total: 1 }, { period_a_x: 1, period_b_x: 2, label: ' Rent ' }, 'junk'])).toEqual([
      { name: 'Rent', period_a: 1, period_b: 2 },
    ]);
    expect(buildCompareSeries([{ period_a_x: 1, period_b_x: 2 }, { period_a_x: 3, period_b_x: 4 }]).map((s) => s.name)).toEqual(['Item 1', 'Item 2']);
  });

  it('caps the series at 8 rows', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ name: `C${i}`, period_a_amount: i, period_b_amount: i }));
    expect(buildCompareSeries(rows)).toHaveLength(8);
  });

  const compareRange = {
    kind: 'compare',
    subkind: 'month_pair',
    label: 'Jun 2026 vs May 2026',
    period_a: { start_iso: 'a', end_iso: 'b', label: 'Jun 2026' },
    period_b: { start_iso: 'c', end_iso: 'd', label: 'May 2026' },
  } satisfies CompareRange;

  it('uses the time_range labels', () => {
    const block = buildCompareBarBlock(compareRange, { rows: [{ category_name: 'Food', period_a_amount: 100, period_b_amount: 200 }] });
    expect(block).toMatchObject({
      type: 'mini_chart',
      chart_kind: 'compare_bar',
      payload: { title: 'Jun 2026 vs May 2026', period_a_label: 'Jun 2026', period_b_label: 'May 2026' },
    });
  });

  it('inserts a compare_bar when the model omitted the chart', () => {
    const blocks: MiniChartBlock[] = [];
    enrichCompareBlocks(blocks, { timeRange: compareRange, lastResult: { rows: [{ period_a_total: 100, period_b_total: 200 }] } });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.chart_kind).toBe('compare_bar');
  });

  it('keeps an existing compare_bar and ignores non-compare ranges', () => {
    const existing: MiniChartBlock = {
      type: 'mini_chart',
      chart_kind: 'compare_bar',
      payload: { period_a_label: 'A', period_b_label: 'B', compare_series: [{ name: 'Food', period_a: 1, period_b: 2 }] },
    };
    const blocks = [existing];
    enrichCompareBlocks(blocks, { timeRange: compareRange, lastResult: { rows: [{ period_a_total: 9, period_b_total: 8 }] } });
    expect(blocks).toEqual([existing]);

    const none: MiniChartBlock[] = [];
    enrichCompareBlocks(none, { timeRange: { kind: 'today' } as PackedRange, lastResult: { rows: [{ period_a_total: 1, period_b_total: 2 }] } });
    enrichCompareBlocks(none, { timeRange: compareRange, lastResult: { rows: [] } });
    expect(none).toEqual([]);
  });
});

describe('parseRespondJson (legacy blocks shape)', () => {
  it('donut block', () => {
    const result = parseRespondJson(`
      {"answer": "Food led your spending.",
       "blocks": [{"type": "mini_chart", "chart_kind": "donut",
         "payload": {"title": "By category", "series": [{"name": "Food", "value": 100}, {"name": "Transport", "value": 50}]}}]}`);
    expect(result.answer).toBe('Food led your spending.');
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.chart_kind).toBe('donut');
    expect(result.blocks[0]?.payload.series).toHaveLength(2);
  });

  it('cashflow block', () => {
    const result = parseRespondJson(
      '{"answer":"Here is the trend.","blocks":[{"type":"mini_chart","chart_kind":"cashflow","payload":{"points":[{"date":"2026-06-01","amount":100}]}}]}',
    );
    expect(result.blocks[0]?.chart_kind).toBe('cashflow');
    expect(result.blocks[0]?.payload.points?.[0]?.date).toBe('2026-06-01');
  });

  it('drops an invalid chart', () => {
    const result = parseRespondJson('{"answer":"No chart.","blocks":[{"type":"mini_chart","chart_kind":"donut","payload":{"title":"Empty"}}]}');
    expect(result.blocks).toEqual([]);
  });

  it('trims donut slices to 8', () => {
    const series = Array.from({ length: 12 }, (_, i) => ({ name: `C${i}`, value: i + 1 }));
    const result = parseRespondJson(JSON.stringify({ answer: 'Many', blocks: [{ type: 'mini_chart', chart_kind: 'donut', payload: { series } }] }));
    expect(result.blocks[0]?.payload.series).toHaveLength(8);
  });

  it('deep link: valid and invalid', () => {
    const ok = parseRespondJson(
      JSON.stringify({
        answer: 'You had 12 Swiggy orders.',
        blocks: [],
        deep_link: {
          screen: 'TransactionsList',
          label: 'View Swiggy transactions',
          params: { filter: 'payee', year: 2026, monthIndex0: 5, payeeKey: 'swiggy', payeeDisplayName: 'Swiggy', payeeKeysTop: [] },
        },
      }),
    );
    expect(ok.deepLink).toMatchObject({ params: { filter: 'payee', payeeId: 'swiggy', payeeKey: 'swiggy' } });

    const bad = parseRespondJson(
      JSON.stringify({ answer: 'Hello', blocks: [], deep_link: { screen: 'TransactionsList', params: { filter: 'payee', year: 2026, monthIndex0: 5 } } }),
    );
    expect(bad.deepLink).toBeNull();
  });
});

describe('parseRespondJson (flat chart / deep_link shape)', () => {
  it('flat donut chart and flat payee deep link', () => {
    const result = parseRespondJson(
      JSON.stringify({
        answer: '  You spent **₹4,820** on Swiggy.  ',
        chart: { chart_kind: 'donut', title: 'Top payees', series: [{ name: 'Swiggy', value: 4820 }, { name: 'Zomato', value: 0 }, { name: '', value: 3 }] },
        deep_link: { filter: 'payee', label: 'View', year: 2026, monthIndex0: 5, payeeId: 'swiggy', payeeDisplayName: 'Swiggy', payeeKeysTop: null },
      }),
    );
    expect(result.answer).toBe('You spent **₹4,820** on Swiggy.');
    // Invalid slices (zero value, empty name) are dropped instead of failing the whole answer.
    expect(result.blocks).toEqual([{ type: 'mini_chart', chart_kind: 'donut', payload: { title: 'Top payees', series: [{ name: 'Swiggy', value: 4820 }] } }]);
    expect(result.deepLink).toEqual({
      screen: 'TransactionsList',
      label: 'View',
      params: { filter: 'payee', year: 2026, monthIndex0: 5, payeeId: 'swiggy', payeeKey: 'swiggy', payeeDisplayName: 'Swiggy', payeeKeysTop: [] },
    });
  });

  it('null chart / deep_link and numeric strings from the model', () => {
    const none = parseRespondJson('{"answer":"Total is ₹10.","chart":null,"deep_link":null}');
    expect(none).toEqual({ answer: 'Total is ₹10.', blocks: [], deepLink: null });
    const loose = parseRespondJson(
      '{"answer":"x","chart":{"chart_kind":"cashflow","points":[{"date":"2026-06-01","amount":"12.5"}]},"deep_link":{"filter":"day","year":"2026","monthIndex0":"5","dayKey":"2026-06-12"}}',
    );
    expect(loose.blocks[0]?.payload.points).toEqual([{ date: '2026-06-01', amount: 12.5 }]);
    expect(loose.deepLink).toMatchObject({ params: { filter: 'day', year: 2026, monthIndex0: 5, dayKey: '2026-06-12' } });
  });

  it('compare_bar fills default labels; cashflow caps at 40 points', () => {
    const compare = chartToBlock({ chart_kind: 'compare_bar', compare_series: [{ name: 'Food', period_a: 1, period_b: 2 }] });
    expect(compare?.payload).toMatchObject({ period_a_label: 'Period A', period_b_label: 'Period B' });
    const points = Array.from({ length: 50 }, (_, i) => ({ date: `2026-06-${String(i + 1).padStart(2, '0')}`, amount: i }));
    expect(chartToBlock({ chart_kind: 'cashflow', points })?.payload.points).toHaveLength(40);
    expect(chartToBlock({ chart_kind: 'cashflow', points: [] })).toBeNull();
    expect(chartToBlock(null)).toBeNull();
  });

  it('extracts JSON from fences and surrounding prose', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonObject('Sure! {"a":1} hope that helps')).toBe('{"a":1}');
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
    expect(parseRespondJson('```json\n{"answer":"ok"}\n```').answer).toBe('ok');
  });

  it('rejects output with no usable answer or no JSON', () => {
    expect(() => parseRespondJson('{"answer":"   "}')).toThrow(/no usable answer/);
    expect(() => parseRespondJson('{"chart":null}')).toThrow(/no usable answer/);
    expect(() => parseRespondJson('not json at all')).toThrow(/not valid JSON/);
  });

  it('validateMiniChart rejects a payload with an invalid item', () => {
    expect(validateMiniChart({ chart_kind: 'donut', payload: { series: [{ name: 'A', value: 0 }] } })).toBeNull();
  });

  it('deepLinkToDict only flattens recognizable links', () => {
    expect(deepLinkToDict('nope')).toBeNull();
    expect(deepLinkToDict({ filter: 'nonsense' })).toBeNull();
    expect(deepLinkToDict({ screen: 'TransactionsList', params: { filter: 'day' } })).toEqual({ screen: 'TransactionsList', params: { filter: 'day' } });
  });
});

describe('sql entities and deep link resolution', () => {
  const UBER = {
    rows: [{ counterparty_normalized: 'uber india', counterparty_name: 'Uber India', total_spending: 1955.14 }],
    row_count: 1,
  };
  const LLM_PAYEE_LINK = {
    screen: 'TransactionsList',
    label: 'View Uber transactions',
    params: { filter: 'payee', year: 2026, monthIndex0: 5, payeeId: 'uber', payeeDisplayName: 'Uber', payeeKeysTop: [] },
  };
  const YEAR_RANGE = {
    kind: 'calendar_year',
    n: null,
    start_date: '2026-01-01',
    end_date: '2026-06-14',
    day_count: 165,
    start_iso: '2026-01-01T00:00:00+05:30',
    end_iso: '2026-06-14T23:59:59.999999+05:30',
    label: 'x',
  } satisfies TimeRange;

  it('extracts a single payee', () => {
    const entities = extractSqlEntities(UBER);
    expect(entities.payees).toEqual([{ payeeId: 'uber india', displayName: 'Uber India' }]);
    expect(entities.categories).toEqual([]);
  });

  it('a bare id only counts as a category with a name column; later rows can fill a missing name', () => {
    expect(extractSqlEntities({ rows: [{ id: 'abc' }] }).categories).toEqual([]);
    expect(extractSqlEntities({ rows: [{ id: 'abc', name: 'Food' }] }).categories).toEqual([{ categoryId: 'abc', displayName: 'Food' }]);
    expect(
      extractSqlEntities({ rows: [{ category_id: 'c1' }, { category_id: 'c1', category_name: 'Food' }, 'junk', null] }).categories,
    ).toEqual([{ categoryId: 'c1', displayName: 'Food' }]);
    expect(extractSqlEntities(null)).toEqual({ payees: [], categories: [] });
  });

  it('overwrites a wrong payee id with the one from SQL and adds the multi-month window', () => {
    const result = resolveDeepLinkIds(LLM_PAYEE_LINK, { lastResult: UBER, timeRange: YEAR_RANGE });
    expect(result).not.toBeNull();
    expect(result?.['params']).toMatchObject({
      payeeId: 'uber india',
      payeeKey: 'uber india',
      payeeDisplayName: 'Uber India',
      fromIso: YEAR_RANGE.start_iso,
      toIso: YEAR_RANGE.end_iso,
      year: 2026,
      monthIndex0: 5,
    });
  });

  it('drops a payee link without a SQL id, or with several', () => {
    expect(resolveDeepLinkIds(LLM_PAYEE_LINK, { lastResult: { rows: [{ total_spending: 1955.14 }] }, timeRange: YEAR_RANGE })).toBeNull();
    const two = { rows: [{ counterparty_normalized: 'a' }, { counterparty_normalized: 'b' }] };
    expect(resolveDeepLinkIds(LLM_PAYEE_LINK, { lastResult: two, timeRange: null })).toBeNull();
  });

  it('binds a category link to the SQL category id', () => {
    const link = {
      screen: 'TransactionsList',
      params: { filter: 'category', year: 2026, monthIndex0: 5, categoryId: '11111111-1111-1111-1111-111111111111', categoryDisplayName: 'Food' },
    };
    const lastResult = { rows: [{ category_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', category_name: 'Food & Dining', total: 8240 }] };
    const result = resolveDeepLinkIds(link, { lastResult, timeRange: null });
    expect(result?.['params']).toMatchObject({ categoryId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', categoryDisplayName: 'Food & Dining' });
  });

  it('day links pass through untouched', () => {
    const link = { screen: 'TransactionsList', params: { filter: 'day', year: 2026, monthIndex0: 5, dayKey: '2026-06-12' } };
    expect(resolveDeepLinkIds(link, { lastResult: null, timeRange: YEAR_RANGE })).toEqual(link);
  });

  it('validateDeepLink enforces the schema', () => {
    expect(validateDeepLink(null)).toBeNull();
    expect(validateDeepLink([])).toBeNull();
    expect(validateDeepLink({ params: { filter: 'day', year: 1999, monthIndex0: 5, dayKey: '2026-06-12' } })).toBeNull();
    expect(validateDeepLink({ params: { filter: 'day', year: 2026, monthIndex0: 12, dayKey: '2026-06-12' } })).toBeNull();
    expect(validateDeepLink({ params: { filter: 'day', year: 2026, monthIndex0: 5, dayKey: 'June 12' } })).toBeNull();
    expect(validateDeepLink({ params: { filter: 'category', year: 2026, monthIndex0: 5, categoryId: 'short', categoryDisplayName: 'Food' } })).toBeNull();
    // fromIso without toIso
    expect(
      validateDeepLink({
        params: { filter: 'category', year: 2026, monthIndex0: 5, categoryId: 'a'.repeat(36), categoryDisplayName: 'Food', fromIso: '2026-01-01T00:00:00Z' },
      }),
    ).toBeNull();
    // nulls are dropped from the dump, defaults applied
    expect(validateDeepLink({ label: null, params: { filter: 'day', year: 2026, monthIndex0: 5, dayKey: '2026-06-12' } })).toEqual({
      screen: 'TransactionsList',
      params: { filter: 'day', year: 2026, monthIndex0: 5, dayKey: '2026-06-12' },
    });
  });

  it('enrichDeepLink leaves single-month windows and day links alone', () => {
    const link = { params: { filter: 'payee', year: 2026, monthIndex0: 5, payeeId: 'x', payeeDisplayName: 'X' } };
    const month = { kind: 'current_month', n: null, start_date: '2026-06-01', end_date: '2026-06-30', day_count: 30, start_iso: 'a', end_iso: 'b', label: 'x' } satisfies TimeRange;
    expect(enrichDeepLink(link, month)?.['params']).not.toHaveProperty('fromIso');
  });
});
