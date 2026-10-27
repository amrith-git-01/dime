import type { ReportListItem } from "../types";
import { istParts, previousPeriodKey } from "./reportFormat";

/** The banner shows from the 1st to the 7th (IST) of the month after the report's month. */
export const BANNER_LAST_DAY = 7;

/**
 * The report the Home banner offers, or null. Shown only when the newest report is unviewed, is
 * the previous IST month's, today (IST) is day 1 to 7 and the user has not dismissed it.
 * `reports` is the list endpoint's rows (any order).
 */
export function pickBannerReport(input: {
  reports: readonly ReportListItem[] | undefined;
  now: Date;
  isDismissed: (periodKey: string) => boolean;
}): ReportListItem | null {
  const { reports, now, isDismissed } = input;
  if (!reports || reports.length === 0) {
    return null;
  }
  const today = istParts(now);
  if (today.day < 1 || today.day > BANNER_LAST_DAY) {
    return null;
  }
  const newest = reports.reduce((best, item) =>
    item.period_key > best.period_key ? item : best,
  );
  if (newest.viewed) {
    return null;
  }
  if (newest.period_key !== previousPeriodKey(today.year, today.month)) {
    return null;
  }
  return isDismissed(newest.period_key) ? null : newest;
}
