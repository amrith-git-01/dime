import { parseDeepLink } from "@/lib/deepLinks/parseDeepLink";
import { resolvePushAction } from "@/lib/notifications/resolvePushAction";

import { isReportPeriodKey, REPORT_PERIOD_PATTERN } from "../utils/periodKey";
import { msUntilNextIstDay, parsePeriodKey } from "../utils/reportFormat";

const KEYS = [
  "2026-10",
  "2000-01",
  "2099-12",
  "1999-12",
  "2100-01",
  "3026-10",
  "0026-10",
  "2026-00",
  "2026-13",
  "2026-1",
  "2026-010",
  "26-10",
  "october",
  "sample",
  "",
  " 2026-10",
];

describe("report period validator", () => {
  it.each(KEYS)("the push, the link, the route and the period math agree on %p", (key) => {
    const valid = isReportPeriodKey(key);
    expect(REPORT_PERIOD_PATTERN.test(key)).toBe(valid);
    expect(parsePeriodKey(key) !== null).toBe(valid);
    const push = resolvePushAction({ action_type: "report", period_key: key });
    expect(push.type === "report").toBe(valid);
    const link = parseDeepLink(`dime://reports/${key}`);
    expect(link?.kind === "report").toBe(valid);
  });

  it("uses the API's range: 2000 onwards", () => {
    expect(isReportPeriodKey("2000-01")).toBe(true);
    expect(isReportPeriodKey("1999-12")).toBe(false);
    expect(isReportPeriodKey(202610)).toBe(false);
    expect(isReportPeriodKey(null)).toBe(false);
  });
});

describe("msUntilNextIstDay", () => {
  it("counts down to India's midnight", () => {
    // 2026-11-07 17:30 UTC is 23:00 in India: one hour to go.
    expect(msUntilNextIstDay(new Date(Date.UTC(2026, 10, 7, 17, 30)))).toBe(60 * 60 * 1000);
    // Exactly at India's midnight a whole day is left.
    expect(msUntilNextIstDay(new Date(Date.UTC(2026, 10, 7, 18, 30)))).toBe(24 * 60 * 60 * 1000);
    expect(msUntilNextIstDay(new Date(Date.UTC(2026, 10, 7, 18, 29, 59)))).toBe(1000);
  });
});
