import * as z from 'zod';
import { describe, expect, it } from 'vitest';

import { MAX_BLOCKS, buildBlocks } from '../src/features/agent/blocks';
import type { ToolResult } from '../src/features/agent/template';
import { TOOL_BY_NAME } from '../src/features/agent/tools';
import { JUNE, NOW, SUMMARY_JUNE, fakeQueries, makeDeps, run, scriptedLlm, toolCall } from './agent-fixtures';

/** Mirrors `frontend/src/features/agent/types.ts` (AgentBlock) exactly: unknown keys are errors. */
const payee = z.strictObject({ name: z.string(), amount: z.number(), share: z.number().nullable() });
const period = z.strictObject({
  spent: z.number(),
  income: z.number(),
  net: z.number(),
  cashflow: z.array(z.strictObject({ date: z.string(), expense: z.number(), income: z.number() })),
  payees: z.array(payee),
});
const frontendBlock = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('metric'), label: z.string(), value: z.string(), delta: z.string().nullable().optional() }),
  z.strictObject({ type: z.literal('category_row'), name: z.string(), amount: z.string(), pct: z.number() }),
  z.strictObject({ type: z.literal('tx_preview'), rows: z.array(z.record(z.string(), z.unknown())), total_count: z.number() }),
  z.strictObject({
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
  }),
  z.strictObject({
    type: z.literal('compare_months'),
    chart_label: z.string().optional(),
    period_a_label: z.string(),
    period_b_label: z.string(),
    period_a: period,
    period_b: period,
  }),
]);
const parse = (blocks: unknown[]) => blocks.map((b) => frontendBlock.parse(b));

const res = (name: ToolResult['name'], data: Record<string, unknown>, args: Record<string, unknown> = {}, blockData?: Record<string, unknown>): ToolResult => ({
  name,
  args,
  ok: true,
  data,
  error: null,
  ms: 1,
  rows: 1,
  blockData: blockData ?? null,
});

const summaryData = {
  period: { from: '2026-06-01', to: '2026-06-30' },
  count: 43,
  debit_display: '₹18,388.50',
  debit_count: 40,
  credit_display: '₹85,000',
  credit_count: 3,
  net_display: '₹66,611.50',
};

describe('app blocks from tool results', () => {
  it('spending_summary -> metric blocks (Spent, Income, Net) with server-formatted amounts', () => {
    const blocks = parse(buildBlocks([res('spending_summary', summaryData)]));
    expect(blocks).toEqual([
      { type: 'metric', label: 'Spent', value: '₹18,388.50', delta: '40 transactions' },
      { type: 'metric', label: 'Income', value: '₹85,000', delta: '3 transactions' },
      { type: 'metric', label: 'Net', value: '₹66,611.50', delta: null },
    ]);
  });

  it('a scoped summary (one payee or category) shows Spent only; an empty one shows nothing', () => {
    expect(parse(buildBlocks([res('spending_summary', { ...summaryData, debit_count: 1 }, { payee_key: 'swiggy' })]))).toEqual([
      { type: 'metric', label: 'Spent', value: '₹18,388.50', delta: '1 transaction' },
    ]);
    expect(buildBlocks([res('spending_summary', { ...summaryData, count: 0 })])).toEqual([]);
  });

  it('category_breakdown -> donut plus the top 3 category rows (percent 0-100)', () => {
    const data = {
      type: 'debit',
      categories: ['Rent', 'Food', 'Transport', 'Bills'].map((name, i) => ({ name, total: String(1000 - i * 100), total_display: `₹${1000 - i * 100}`, share: 40 - i * 10 })),
    };
    const blocks = parse(buildBlocks([res('category_breakdown', data)]));
    expect(blocks.map((b) => b.type)).toEqual(['mini_chart', 'category_row', 'category_row', 'category_row']);
    expect(blocks[1]).toEqual({ type: 'category_row', name: 'Rent', amount: '₹1000', pct: 40 });
  });

  it('list_transactions -> tx_preview with at most 5 rows, the total count and never a note', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ date: `2026-06-0${i + 1}`, payee: `Shop ${i}`, amount: String(i), amount_display: `₹${i}`, type: i % 2 ? 'credit' : 'debit', category: 'Food', note: 'secret' }));
    const [block] = parse(buildBlocks([res('list_transactions', { rows, total_count: 12 })]));
    expect(block).toMatchObject({ type: 'tx_preview', total_count: 12 });
    const preview = block as { rows: Record<string, unknown>[] };
    expect(preview.rows).toHaveLength(5);
    expect(preview.rows[0]).toEqual({ date: '2026-06-01', counterparty_name: 'Shop 0', amount: '₹0', type: 'debit', category: 'Food' });
    expect(JSON.stringify(block)).not.toContain('secret');
    expect(buildBlocks([res('list_transactions', { rows: [], total_count: 0 })])).toEqual([]);
  });

  it('compare_periods of two non-month ranges keeps the compare_bar chart', () => {
    const data = { period_a: { from: '2026-07-01', to: '2026-07-15' }, period_b: { from: '2026-07-16', to: '2026-07-31' }, a: { debit: '10.00', credit: '0.00' }, b: { debit: '20.00', credit: '5.00' } };
    expect(parse(buildBlocks([res('compare_periods', data)])).map((b) => (b.type === 'mini_chart' ? b.chart_kind : b.type))).toEqual(['compare_bar']);
  });

  it('keeps at most one chart and caps the total, newest tool first', () => {
    const donut = res('category_breakdown', { categories: [{ name: 'A', total: '5.00', total_display: '₹5', share: 50 }, { name: 'B', total: '5.00', total_display: '₹5', share: 50 }] });
    const payees = res('top_payees', { payees: [{ name: 'A', total: '5.00' }, { name: 'B', total: '5.00' }] });
    const blocks = parse(buildBlocks([payees, donut, res('spending_summary', summaryData)]));
    expect(blocks.length).toBeLessThanOrEqual(MAX_BLOCKS);
    expect(blocks[0]?.type).toBe('metric'); // the last tool used leads
    expect(blocks.filter((b) => b.type === 'mini_chart')).toHaveLength(1);
  });
});

describe('compare_months from compare_periods', () => {
  const swiggy = { payee_key: 'swiggy', name: 'Swiggy', total: 500, share: 25.5, count: 3 };
  const julyDays = [{ date: '2026-07-02', debit: 100, credit: 0 }, { date: '2026-07-31', debit: 50, credit: 85000 }];
  const juneDays = [{ date: '2026-06-10', debit: 70, credit: 0 }];
  const sums = { a: { debit: 150, credit: 85000, net: 84850, count: 3 }, b: { debit: 70, credit: 0, net: -70, count: 1 } };

  const run1 = async (args: unknown, handlers: Record<string, unknown>) => {
    const db = fakeQueries(handlers);
    const { llm } = scriptedLlm([{ calls: [toolCall('compare_periods', args)] }, { content: 'You spent ₹150 in July 2026 against ₹70 in June 2026.' }]);
    const { result } = await run(makeDeps(llm, db), 'compare July 2026 and June 2026');
    return { result, db };
  };
  const handlers = (a: unknown, b: unknown) => {
    let daily = 0;
    let top = 0;
    return {
      compare_periods: { by: 'total', ...sums, delta: { debit: 80, debit_pct: 114.3, credit: 85000, net: 84920 } },
      daily_cashflow: () => ({ days: daily++ === 0 ? a : b }),
      top_payees: () => ({ payees: top++ === 0 ? [swiggy] : [] }),
    };
  };

  it('two calendar months -> a compare_months card in the exact frontend shape, fetched in the same step', async () => {
    const { result, db } = await run1({ a: { from: '2026-07-01', to: '2026-07-31' }, b: { from: '2026-06-01', to: '2026-06-30' } }, handlers(julyDays, juneDays));
    const blocks = parse(result.response.blocks);
    expect(blocks.map((b) => b.type)).toEqual(['compare_months']); // no compare_bar next to it, as before
    const card = blocks[0] as z.infer<typeof frontendBlock> & { period_a: z.infer<typeof period>; period_b: z.infer<typeof period> };
    expect(card).toMatchObject({ period_a_label: 'Jul 2026', period_b_label: 'Jun 2026' });
    expect(card).not.toHaveProperty('chart_label');
    expect(card.period_a).toMatchObject({ spent: 150, income: 85000, net: 84850, payees: [{ name: 'Swiggy', amount: 500, share: 0.255 }] });
    expect(card.period_a.cashflow).toHaveLength(31); // zero-filled over the whole month
    expect(card.period_a.cashflow[1]).toEqual({ date: '2026-07-02', expense: 100, income: 0 });
    expect(card.period_b.cashflow).toHaveLength(30);
    // All five queries (compare + 2 daily + 2 payees) run in the one step; the model only saw the compare result.
    expect(db.calls().map((c) => c.name)).toEqual(['compare_periods', 'daily_cashflow', 'daily_cashflow', 'top_payees', 'top_payees']);
  });

  it('two years (full or year to date) -> monthly cashflow and chart_label "Monthly Spend"', async () => {
    const ytd = [{ date: '2026-01-15', debit: 10, credit: 0 }, { date: '2026-01-20', debit: 5, credit: 0 }, { date: '2026-03-02', debit: 7, credit: 100 }];
    const { result } = await run1({ a: { from: '2026-01-01', to: '2026-10-04' }, b: { from: '2025-01-01', to: '2025-12-31' } }, handlers(ytd, [{ date: '2025-12-25', debit: 9, credit: 0 }]));
    const [card] = parse(result.response.blocks) as unknown as { chart_label: string; period_a_label: string; period_b_label: string; period_a: z.infer<typeof period>; period_b: z.infer<typeof period> }[];
    expect(card).toMatchObject({ type: 'compare_months', chart_label: 'Monthly Spend', period_a_label: '2026 (YTD)', period_b_label: '2025' });
    expect(card?.period_a.cashflow.map((m) => m.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']);
    expect(card?.period_a.cashflow[0]).toEqual({ date: '2026-01-01', expense: 15, income: 0 });
    expect(card?.period_a.cashflow[2]).toEqual({ date: '2026-03-01', expense: 7, income: 100 });
    expect(card?.period_b.cashflow).toHaveLength(12);
  });

  it('falls back to compare_bar when the extra data is missing (an extra call failed)', () => {
    const p = TOOL_BY_NAME.get('compare_periods')?.prepare(JSON.stringify({ a: { from: '2026-07-01', to: '2026-07-31' }, b: { from: '2026-06-01', to: '2026-06-30' } }), { tz: 'Asia/Kolkata', nowMs: NOW });
    if (!p) throw new Error('expected a prepared tool');
    expect(p.extra).toHaveLength(4);
    const out = p.shape({ by: 'total', ...sums }, []);
    expect(out.blockData).toBeUndefined();
    const types = parse(buildBlocks([res('compare_periods', { ...out.data, period_a: { from: '2026-07-01', to: '2026-07-31' }, period_b: { from: '2026-06-01', to: '2026-06-30' } })])).map((b) => b.type);
    expect(types).toEqual(['mini_chart']);
  });

  it('extra data stays out of the model prompt and out of verification', async () => {
    const db = fakeQueries(handlers(julyDays, juneDays));
    const { llm, calls } = scriptedLlm([{ calls: [toolCall('compare_periods', { a: { from: '2026-07-01', to: '2026-07-31' }, b: { from: '2026-06-01', to: '2026-06-30' } })] }, { content: 'You spent ₹500 at Swiggy.' }]);
    const { result } = await run(makeDeps(llm, db), 'compare July 2026 and June 2026');
    const toolMsg = JSON.stringify(calls[1]?.messages.filter((m) => m.role === 'tool'));
    expect(toolMsg).not.toContain('Swiggy');
    expect(result.outcome).toBe('template'); // ₹500 only exists in block data: not a verified figure
  });

  it('other tools take no extra calls', () => {
    const p = TOOL_BY_NAME.get('spending_summary')?.prepare(JSON.stringify(JUNE), { tz: 'Asia/Kolkata', nowMs: NOW });
    expect(p?.extra).toBeFalsy();
    expect(SUMMARY_JUNE.count).toBe(43);
  });
});
