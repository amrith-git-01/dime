import type { ReportSnapshot } from "../types";
import {
  formatPercent,
  formatReportAmount,
  weekdayShort,
} from "./reportFormat";

export type ReportStat = { value: string; label: string };

/**
 * The three key stats of the closing slide and of the share card. Rupee amounts are left out
 * unless `showAmounts` is on (the default for a shared card is off: percentages and counts only).
 */
export function buildReportStats(
  snapshot: ReportSnapshot,
  showAmounts: boolean,
): ReportStat[] {
  const top = snapshot.categories[0];
  const payments: ReportStat = {
    value: String(snapshot.debit_count),
    label: snapshot.debit_count === 1 ? "payment" : "payments",
  };

  if (showAmounts) {
    return [
      { value: formatReportAmount(snapshot.spent), label: "spent" },
      payments,
      top
        ? { value: formatReportAmount(top.amount), label: `on ${top.name}` }
        : { value: String(snapshot.no_spend_days), label: "no-spend days" },
    ];
  }

  return [
    payments,
    top
      ? { value: formatPercent(top.share), label: `on ${top.name}` }
      : { value: String(snapshot.no_spend_days), label: "no-spend days" },
    {
      value: weekdayShort(snapshot.weekday.peak_index),
      label: "busiest weekday",
    },
  ];
}
