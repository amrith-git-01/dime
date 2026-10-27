import type { ReportSnapshot } from "../types";
import { isReportPeriodKey } from "./periodKey";

/**
 * Whether stored or received data is a snapshot at all (an object with its identity). A persisted
 * entry that fails this is treated as missing and fetched again; it is also never written to disk.
 */
export function isReportSnapshot(raw: unknown): raw is ReportSnapshot {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  const item = raw as Record<string, unknown>;
  return (
    isReportPeriodKey(item.period_key) &&
    typeof item.year === "number" &&
    typeof item.month === "number" &&
    typeof item.version === "number"
  );
}
