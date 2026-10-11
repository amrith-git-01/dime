import { formatInr } from './money';
import type { SqlRun } from './state';

/**
 * The deterministic answer used when the model cannot be trusted or reached: a plain list of the first rows
 * of the last useful query result, so every figure in it is the database's by construction.
 */

export const NO_DATA_ANSWER = "I couldn't get that information right now. Please try again, or ask about your spending in a specific period.";
export const EMPTY_RESULT_ANSWER = "I couldn't find any matching data for that.";

const MAX_ROWS = 5;
const NOT_MONEY = /count|number|\bn$|^n$|pct|percent|share|days?\b|weekday|rank|year|month|_id$|_key$|^id$/i;
const MONEY = /amount|total|spen[dt]|budget|remaining|income|expense|debit|credit|net|avg|average|sum|saving|salary|cost|price/i;
const PERCENT = /pct|percent|share/i;

const isMoney = (column: string): boolean => MONEY.test(column) && !NOT_MONEY.test(column);

function format(column: string, cell: string | number | null): string {
  if (cell === null) return '-';
  if (typeof cell === 'string') return cell;
  if (PERCENT.test(column)) return `${cell}%`;
  return isMoney(column) ? formatInr(cell) : String(cell);
}

/** An answer built only from the query results (the last one with rows), or a generic apology when there are none. */
export function fallbackAnswer(runs: readonly SqlRun[]): string {
  if (runs.length === 0) return NO_DATA_ANSWER;
  const run = [...runs].reverse().find((r) => r.rows.length > 0);
  if (!run) return EMPTY_RESULT_ANSWER;
  const lines = run.rows.slice(0, MAX_ROWS).map((row) => `- ${run.columns.map((c, i) => `${c.replace(/_/g, ' ')}: ${format(c, row[i] ?? null)}`).join(', ')}`);
  const more = run.rows.length > MAX_ROWS ? `\n(First ${MAX_ROWS} of ${run.rows.length}${run.truncated ? '+' : ''} rows.)` : '';
  return `Here's what I found:\n${lines.join('\n')}${more}`;
}
