import type { ReportRoastLevel } from "../types";
import { gentleCopy } from "./gentle";
import { savageCopy } from "./savage";
import { spicyCopy } from "./spicy";
import type { LevelCopy } from "./types";

export { hashString, pickVariant } from "./seed";
export { resolveReportCopy, type ResolvedCopy } from "./resolve";
export type { LevelCopy, Variants } from "./types";

/** All the words of the report, one reviewable file per roast level. */
export const REPORT_COPY: Readonly<Record<ReportRoastLevel, LevelCopy>> = {
  gentle: gentleCopy,
  spicy: spicyCopy,
  savage: savageCopy,
};
