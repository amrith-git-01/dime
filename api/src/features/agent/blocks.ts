import { validateMiniChart } from './chart';
import { parseIsoDate } from './dates';
import type { MiniChartBlock } from './schemas';
import type { SqlCell } from './sql-guard';
import type { SqlRun, TurnState } from './state';

/**
 * App blocks are built from the turn's query results, never from model text: the numbers are the
 * database's and the payload goes through the same schema validation the app contract defines. The only
 * block the SQL agent produces is the mini chart of `show_chart` (one per answer).
 */

export type AgentBlock = Record<string, unknown>;

/** A chart request the rows cannot satisfy; the message goes back to the model. */
export class ChartError extends Error {
  override name = 'ChartError';
}

export interface ChartRequest {
  kind: 'donut' | 'cashflow' | 'compare_bar';
  title: string;
  label_column: string;
  value_columns: string[];
  series_labels?: string[] | undefined;
}

export const buildBlocks = (state: TurnState): AgentBlock[] => (state.chart ? [state.chart as unknown as AgentBlock] : []);

function numberCell(cell: SqlCell | undefined): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
  if (typeof cell === 'string' && /^-?\d+(\.\d+)?$/.test(cell.trim())) return Number(cell);
  return null;
}

/** Finds a column by name (case-insensitive) in a run, or says which columns exist. */
function columnIndex(run: SqlRun, name: string): number {
  const at = run.columns.findIndex((c) => c.toLowerCase() === name.toLowerCase());
  if (at === -1) throw new ChartError(`Result ${run.id} has no column "${name}". Its columns: ${run.columns.join(', ')}.`);
  return at;
}

const MAX_DONUT_SLICES = 8;

/** The mini_chart payload of a run, or an error message for the model. */
export function chartFrom(args: ChartRequest, run: SqlRun): MiniChartBlock {
  const labelAt = columnIndex(run, args.label_column);
  const valueAt = args.value_columns.map((c) => columnIndex(run, c));
  const label = (row: SqlCell[]): string => String(row[labelAt] ?? 'Unknown').trim() || 'Unknown';
  let payload: Record<string, unknown>;

  if (args.kind === 'donut') {
    if (valueAt.length !== 1) throw new ChartError('A donut chart takes exactly one value column.');
    const slices = run.rows.flatMap((r) => {
      const value = numberCell(r[valueAt[0] ?? 0]);
      return value !== null && value > 0 ? [{ name: label(r), value }] : [];
    });
    if (slices.length < 2) throw new ChartError('A donut chart needs at least 2 rows with a positive value.');
    // More than 8 slices: the smallest ones are summed into "Other" (the total stays the database's).
    const series =
      slices.length > MAX_DONUT_SLICES
        ? [...slices.slice(0, MAX_DONUT_SLICES - 1), { name: 'Other', value: slices.slice(MAX_DONUT_SLICES - 1).reduce((t, s) => t + s.value, 0) }]
        : slices;
    payload = { title: args.title, series };
  } else if (args.kind === 'cashflow') {
    if (valueAt.length !== 1) throw new ChartError('A cashflow chart takes exactly one value column.');
    const points = run.rows.flatMap((r) => {
      const amount = numberCell(r[valueAt[0] ?? 0]);
      const date = /^\d{4}-\d{2}$/.test(label(r)) ? `${label(r)}-01` : label(r);
      return amount !== null && amount >= 0 && parseIsoDate(date) ? [{ date, amount }] : [];
    });
    if (points.length === 0) throw new ChartError('A cashflow chart needs rows with a date (YYYY-MM-DD) in the label column and a non-negative amount.');
    payload = { title: args.title, points };
  } else {
    if (valueAt.length !== 2) throw new ChartError('A compare_bar chart takes exactly two value columns (period A, period B).');
    const series = run.rows.flatMap((r) => {
      const a = numberCell(r[valueAt[0] ?? 0]);
      const b = numberCell(r[valueAt[1] ?? 0]);
      return a !== null && b !== null && a >= 0 && b >= 0 ? [{ name: label(r), period_a: a, period_b: b }] : [];
    });
    if (series.length === 0) throw new ChartError('A compare_bar chart needs rows with two non-negative values.');
    payload = {
      title: args.title,
      period_a_label: args.series_labels?.[0] ?? args.value_columns[0],
      period_b_label: args.series_labels?.[1] ?? args.value_columns[1],
      compare_series: series,
    };
  }
  const chart = validateMiniChart({ chart_kind: args.kind, payload });
  if (!chart) throw new ChartError('That data cannot be drawn as a chart. Check the columns and values.');
  return chart;
}
