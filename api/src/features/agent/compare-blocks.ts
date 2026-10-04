import type { CompareItem, MiniChartBlock } from './schemas';
import type { TimeRange } from './time-range';
import { isCompareRange } from './time-range';

/** Build compare_bar mini charts from SQL rows when the model omitted them (port of `compare_blocks.py`). */

const MAX_COMPARE_ROWS = 8;
const LABEL_KEYS = ['category_name', 'counterparty_name', 'name', 'label'] as const;

type Row = Record<string, unknown>;

function nonEmptyStr(value: unknown): string | null {
  if (typeof value === 'string') {
    const stripped = value.trim();
    if (stripped) return stripped;
  }
  return null;
}

function rowLabel(row: Row, fallback: string): string {
  for (const key of LABEL_KEYS) {
    const label = nonEmptyStr(row[key]);
    if (label) return label;
  }
  return fallback;
}

/** First numeric column whose name starts with the prefix (`period_a_amount`, `period_a_total`, ...). */
function periodValue(row: Row, prefix: string): number | null {
  for (const [key, raw] of Object.entries(row)) {
    if (!key.toLowerCase().startsWith(prefix)) continue;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  }
  return null;
}

/** Map SQL rows to compare_bar series items (rows without both period columns are skipped). */
export function buildCompareSeries(rows: readonly unknown[]): CompareItem[] {
  const series: CompareItem[] = [];
  rows.forEach((raw, index) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return;
    const row = raw as Row;
    const periodA = periodValue(row, 'period_a_');
    const periodB = periodValue(row, 'period_b_');
    if (periodA === null || periodB === null) return;
    const name = rowLabel(row, rows.length === 1 ? 'Total spending' : `Item ${index + 1}`);
    series.push({ name, period_a: periodA, period_b: periodB });
  });
  return series.slice(0, MAX_COMPARE_ROWS);
}

export function buildCompareBarBlock(
  timeRange: TimeRange,
  lastResult: { rows?: unknown } | null | undefined,
): MiniChartBlock | null {
  if (!isCompareRange(timeRange)) return null;
  const rows = lastResult?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const compareSeries = buildCompareSeries(rows);
  if (compareSeries.length === 0) return null;

  const periodALabel = nonEmptyStr(timeRange.period_a.label) ?? 'Period A';
  const periodBLabel = nonEmptyStr(timeRange.period_b.label) ?? 'Period B';
  const title = nonEmptyStr(timeRange.label) ?? `${periodALabel} vs ${periodBLabel}`;
  return {
    type: 'mini_chart',
    chart_kind: 'compare_bar',
    payload: { title, period_a_label: periodALabel, period_b_label: periodBLabel, compare_series: compareSeries },
  };
}

/**
 * Compare queries always ship a compare_bar: the respond model often returns prose only even when
 * the SQL has valid period_a / period_b columns. Mutates `blocks` (replaces them with the built chart).
 */
export function enrichCompareBlocks(
  blocks: MiniChartBlock[],
  ctx: { timeRange: TimeRange | null | undefined; lastResult: { rows?: unknown } | null | undefined },
): void {
  if (!ctx.timeRange || !isCompareRange(ctx.timeRange)) return;
  if (blocks.some((b) => b.chart_kind === 'compare_bar')) return;
  const built = buildCompareBarBlock(ctx.timeRange, ctx.lastResult);
  if (built === null) return;
  blocks.length = 0;
  blocks.push(built);
}
