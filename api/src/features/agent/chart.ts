import { miniChartPayloadSchema } from './schemas';
import type { MiniChartBlock, MiniChartPayload } from './schemas';

const MAX_DONUT_SLICES = 8;
const MAX_COMPARE_ROWS = 8;
const MAX_CASHFLOW_POINTS = 40;

const compact = (payload: MiniChartPayload): MiniChartPayload =>
  Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== null));

/**
 * Re-validates a chart payload and normalizes it per kind: donut keeps 8 slices, compare_bar 8 rows
 * with default labels, cashflow at most 40 points. Null when the payload is invalid or has nothing to draw.
 */
export function validateMiniChart(block: { chart_kind: MiniChartBlock['chart_kind']; payload: Record<string, unknown> }): MiniChartBlock | null {
  const parsed = miniChartPayloadSchema.safeParse(block.payload);
  if (!parsed.success) return null;
  const p = parsed.data;
  const title = p.title ?? undefined;

  if (block.chart_kind === 'donut') {
    const series = p.series ?? [];
    if (series.length === 0) return null;
    return { type: 'mini_chart', chart_kind: 'donut', payload: compact({ title, series: series.slice(0, MAX_DONUT_SLICES) }) };
  }
  if (block.chart_kind === 'compare_bar') {
    const compare = p.compare_series ?? [];
    if (compare.length === 0) return null;
    return {
      type: 'mini_chart',
      chart_kind: 'compare_bar',
      payload: compact({
        title,
        period_a_label: p.period_a_label || 'Period A',
        period_b_label: p.period_b_label || 'Period B',
        compare_series: compare.slice(0, MAX_COMPARE_ROWS),
      }),
    };
  }
  const points = p.points ?? [];
  if (points.length === 0) return null;
  return { type: 'mini_chart', chart_kind: 'cashflow', payload: compact({ title, points: points.slice(0, MAX_CASHFLOW_POINTS) }) };
}
