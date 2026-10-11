import * as z from 'zod';
import { describe, expect, it } from 'vitest';

import { buildBlocks, chartFrom, ChartError } from '../src/features/agent/blocks';
import { validateMiniChart } from '../src/features/agent/chart';
import { newTurnState } from '../src/features/agent/state';
import type { SqlRun } from '../src/features/agent/state';

/** Mirrors the `mini_chart` block of `frontend/src/features/agent/types.ts` exactly: unknown keys are errors. */
const frontendChart = z.strictObject({
  type: z.literal('mini_chart'),
  chart_kind: z.enum(['cashflow', 'donut', 'compare_bar']),
  payload: z.strictObject({
    title: z.string().optional(),
    series: z.array(z.strictObject({ name: z.string(), value: z.number() })).optional(),
    points: z.array(z.strictObject({ date: z.string(), amount: z.number() })).optional(),
    period_a_label: z.string().optional(),
    period_b_label: z.string().optional(),
    compare_series: z.array(z.strictObject({ name: z.string(), period_a: z.number(), period_b: z.number() })).optional(),
  }),
});

const runOf = (columns: string[], rows: SqlRun['rows']): SqlRun => ({ id: 'r1', columns, rows, shown: rows.length, truncated: false });
const fail = (fn: () => unknown): string => {
  try {
    fn();
  } catch (err) {
    if (err instanceof ChartError) return err.message;
    throw err;
  }
  throw new Error('expected a ChartError');
};

describe('charts from run_sql results', () => {
  const categories = runOf(['category', 'total'], [['Rent', 9000], ['Food', 4000], ['Transport', 1500], ['Misc', 0]]);

  it('donut: label + value columns, rows without a positive value are left out', () => {
    const chart = chartFrom({ kind: 'donut', title: 'Spending by category', label_column: 'category', value_columns: ['total'] }, categories);
    expect(frontendChart.parse(chart)).toEqual({
      type: 'mini_chart',
      chart_kind: 'donut',
      payload: { title: 'Spending by category', series: [{ name: 'Rent', value: 9000 }, { name: 'Food', value: 4000 }, { name: 'Transport', value: 1500 }] },
    });
  });

  it('donut: more than 8 slices fold the smallest into "Other" and keep the total', () => {
    const rows = Array.from({ length: 11 }, (_, i) => [`Item ${i}`, 100 - i] as [string, number]);
    const chart = chartFrom({ kind: 'donut', title: 'T', label_column: 'a', value_columns: ['b'] }, runOf(['a', 'b'], rows));
    const series = chart.payload.series ?? [];
    expect(series).toHaveLength(8);
    expect(series[7]).toEqual({ name: 'Other', value: 93 + 92 + 91 + 90 });
    expect(series.reduce((t, s) => t + s.value, 0)).toBe(rows.reduce((t, r) => t + r[1], 0));
  });

  it('donut: needs two slices; unknown columns say which exist (case-insensitive match)', () => {
    expect(fail(() => chartFrom({ kind: 'donut', title: 'T', label_column: 'category', value_columns: ['total'] }, runOf(['category', 'total'], [['A', 5]])))).toMatch(/at least 2/);
    expect(fail(() => chartFrom({ kind: 'donut', title: 'T', label_column: 'nope', value_columns: ['total'] }, categories))).toBe('Result r1 has no column "nope". Its columns: category, total.');
    expect(chartFrom({ kind: 'donut', title: 'T', label_column: 'CATEGORY', value_columns: ['Total'] }, categories).payload.series).toHaveLength(3);
  });

  it('cashflow: dates as YYYY-MM-DD (a YYYY-MM month becomes its first day), non-negative amounts', () => {
    const daily = runOf(['day', 'spent'], [['2026-06-01', 120.5], ['2026-06-02', 0], ['2026-06-03', '80'], ['June', 5]]);
    expect(frontendChart.parse(chartFrom({ kind: 'cashflow', title: 'Daily', label_column: 'day', value_columns: ['spent'] }, daily)).payload.points).toEqual([
      { date: '2026-06-01', amount: 120.5 },
      { date: '2026-06-02', amount: 0 },
      { date: '2026-06-03', amount: 80 },
    ]);
    const monthly = runOf(['m', 'spent'], [['2026-05', 10], ['2026-06', 20]]);
    expect(chartFrom({ kind: 'cashflow', title: 'Monthly', label_column: 'm', value_columns: ['spent'] }, monthly).payload.points?.map((p) => p.date)).toEqual(['2026-05-01', '2026-06-01']);
    expect(fail(() => chartFrom({ kind: 'cashflow', title: 'T', label_column: 'a', value_columns: ['b'] }, runOf(['a', 'b'], [['Monday', 5]])))).toMatch(/needs rows with a date/);
  });

  it('compare_bar: two value columns, labels from series_labels or the column names', () => {
    const rows = runOf(['category', 'jun', 'may'], [['Food', 4000, 3500], ['Rent', 9000, 9000], ['Gone', null, 5]]);
    const chart = chartFrom({ kind: 'compare_bar', title: 'June vs May', label_column: 'category', value_columns: ['jun', 'may'], series_labels: ['June', 'May'] }, rows);
    expect(frontendChart.parse(chart).payload).toEqual({
      title: 'June vs May',
      period_a_label: 'June',
      period_b_label: 'May',
      compare_series: [{ name: 'Food', period_a: 4000, period_b: 3500 }, { name: 'Rent', period_a: 9000, period_b: 9000 }],
    });
    expect(chartFrom({ kind: 'compare_bar', title: 'T', label_column: 'category', value_columns: ['jun', 'may'] }, rows).payload).toMatchObject({ period_a_label: 'jun', period_b_label: 'may' });
    expect(fail(() => chartFrom({ kind: 'compare_bar', title: 'T', label_column: 'category', value_columns: ['jun'] }, rows))).toMatch(/exactly two/);
    expect(fail(() => chartFrom({ kind: 'donut', title: 'T', label_column: 'category', value_columns: ['jun', 'may'] }, rows))).toMatch(/exactly one/);
  });

  it('validateMiniChart still normalizes each kind (8 slices, 8 compare rows, 40 points) and rejects empty ones', () => {
    expect(validateMiniChart({ chart_kind: 'donut', payload: { series: [] } })).toBeNull();
    expect(validateMiniChart({ chart_kind: 'donut', payload: { series: [{ name: 'A', value: -1 }] } })).toBeNull();
    expect(validateMiniChart({ chart_kind: 'cashflow', payload: { points: Array.from({ length: 50 }, (_, i) => ({ date: `2026-06-${String(i + 1).padStart(2, '0')}`, amount: 1 })) } })?.payload.points).toHaveLength(40);
    expect(validateMiniChart({ chart_kind: 'compare_bar', payload: { compare_series: [{ name: 'A', period_a: 1, period_b: 2 }] } })?.payload).toMatchObject({ period_a_label: 'Period A', period_b_label: 'Period B' });
  });
});

describe('buildBlocks', () => {
  it('is the chart of the turn, or nothing', () => {
    const state = newTurnState();
    expect(buildBlocks(state)).toEqual([]);
    state.chart = chartFrom({ kind: 'donut', title: 'T', label_column: 'a', value_columns: ['b'] }, runOf(['a', 'b'], [['A', 1], ['B', 2]]));
    expect(buildBlocks(state)).toEqual([state.chart]);
  });
});
