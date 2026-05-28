import type { MonthSummary } from "./types";

/** Parse server `debit_by_category` into positive spend amounts per category key. */
export function monthSummaryDebitByCategory(
  summary: MonthSummary,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [categoryId, raw] of Object.entries(
    summary.debit_by_category ?? {},
  )) {
    const n = Number.parseFloat(raw);
    const add = Number.isFinite(n) ? Math.abs(n) : 0;
    if (add > 0) {
      totals[categoryId] = add;
    }
  }
  return totals;
}
