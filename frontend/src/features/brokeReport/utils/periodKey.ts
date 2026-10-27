/**
 * A report's `YYYY-MM` key, 2000 onwards: the same rule as the API's `periodParamSchema`. The push
 * action, the `dime://reports/` link, the route param and the period math all use this one check.
 */
export const REPORT_PERIOD_PATTERN = /^20\d{2}-(?:0[1-9]|1[0-2])$/;

export function isReportPeriodKey(value: unknown): value is string {
  return typeof value === "string" && REPORT_PERIOD_PATTERN.test(value);
}
