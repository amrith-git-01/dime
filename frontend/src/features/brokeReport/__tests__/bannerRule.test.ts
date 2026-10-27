import type { ReportListItem } from "../types";
import { pickBannerReport } from "../utils/bannerRule";
import {
  formatDayMonth,
  formatReportAmount,
  istParts,
  parsePeriodKey,
  previousPeriodKey,
} from "../utils/reportFormat";

function item(period_key: string, viewed = false): ReportListItem {
  const [year, month] = period_key.split("-").map(Number);
  return { period_key, year, month, debit_count: 12, viewed };
}

const notDismissed = () => false;

describe("pickBannerReport", () => {
  const reports = [item("2026-09", true), item("2026-10")];

  it("shows the unviewed previous-month report on days 1 to 7 (IST)", () => {
    for (const day of [1, 4, 7]) {
      const now = new Date(Date.UTC(2026, 10, day, 6, 0));
      expect(pickBannerReport({ reports, now, isDismissed: notDismissed })?.period_key).toBe(
        "2026-10",
      );
    }
  });

  it("hides from day 8, and before the first report exists", () => {
    const day8 = new Date(Date.UTC(2026, 10, 8, 6, 0));
    expect(pickBannerReport({ reports, now: day8, isDismissed: notDismissed })).toBeNull();
    const day1 = new Date(Date.UTC(2026, 10, 1, 6, 0));
    expect(pickBannerReport({ reports: [], now: day1, isDismissed: notDismissed })).toBeNull();
    expect(pickBannerReport({ reports: undefined, now: day1, isDismissed: notDismissed })).toBeNull();
  });

  it("uses the IST calendar day, not the device's", () => {
    // 2026-11-07 20:00 UTC is already 8 Nov, 01:30 in India.
    const lateOnThe7th = new Date(Date.UTC(2026, 10, 7, 20, 0));
    expect(pickBannerReport({ reports, now: lateOnThe7th, isDismissed: notDismissed })).toBeNull();
    // 2026-10-31 20:00 UTC is already 1 Nov, 01:30 in India.
    const midnightIst = new Date(Date.UTC(2026, 9, 31, 20, 0));
    expect(pickBannerReport({ reports, now: midnightIst, isDismissed: notDismissed })?.period_key).toBe(
      "2026-10",
    );
  });

  it("needs the newest report to be unviewed", () => {
    const viewed = [item("2026-10", true)];
    const now = new Date(Date.UTC(2026, 10, 2, 6, 0));
    expect(pickBannerReport({ reports: viewed, now, isDismissed: notDismissed })).toBeNull();
    // An older unviewed one does not count: only the newest is offered.
    const older = [item("2026-10", true), item("2026-09", false)];
    expect(pickBannerReport({ reports: older, now, isDismissed: notDismissed })).toBeNull();
  });

  it("needs the newest report to be last month's", () => {
    const stale = [item("2026-09")];
    const now = new Date(Date.UTC(2026, 10, 2, 6, 0));
    expect(pickBannerReport({ reports: stale, now, isDismissed: notDismissed })).toBeNull();
  });

  it("finds the newest report whatever the list order", () => {
    const now = new Date(Date.UTC(2026, 10, 2, 6, 0));
    const shuffled = [item("2026-08", true), item("2026-10"), item("2026-09", true)];
    expect(pickBannerReport({ reports: shuffled, now, isDismissed: notDismissed })?.period_key).toBe(
      "2026-10",
    );
  });

  it("respects a dismissal for that month only", () => {
    const now = new Date(Date.UTC(2026, 10, 2, 6, 0));
    const dismissed = (key: string) => key === "2026-10";
    expect(pickBannerReport({ reports, now, isDismissed: dismissed })).toBeNull();
    // The next month's report is not affected by last month's dismissal.
    const december = new Date(Date.UTC(2026, 11, 2, 6, 0));
    const next = [item("2026-11"), item("2026-10", true)];
    expect(pickBannerReport({ reports: next, now: december, isDismissed: dismissed })?.period_key).toBe(
      "2026-11",
    );
  });

  it("rolls over the year", () => {
    const now = new Date(Date.UTC(2027, 0, 3, 6, 0));
    expect(
      pickBannerReport({ reports: [item("2026-12")], now, isDismissed: notDismissed })?.period_key,
    ).toBe("2026-12");
  });
});

describe("report formatting helpers", () => {
  it("computes the IST day and the previous period", () => {
    expect(istParts(new Date(Date.UTC(2026, 9, 31, 18, 0)))).toEqual({ year: 2026, month: 10, day: 31 });
    expect(istParts(new Date(Date.UTC(2026, 9, 31, 18, 30)))).toEqual({ year: 2026, month: 11, day: 1 });
    expect(previousPeriodKey(2027, 1)).toBe("2026-12");
    expect(previousPeriodKey(2026, 11)).toBe("2026-10");
    expect(parsePeriodKey("2026-10")).toEqual({ year: 2026, month: 10 });
    expect(parsePeriodKey("2026-13")).toBeNull();
    expect(parsePeriodKey("sample")).toBeNull();
  });

  it("writes hero amounts compactly", () => {
    expect(formatReportAmount("18620.00")).toBe("₹18.6k");
    expect(formatReportAmount("950")).toBe("₹950");
    expect(formatReportAmount("1000")).toBe("₹1k");
    expect(formatReportAmount("99950")).toBe("₹1L");
    expect(formatReportAmount("125000")).toBe("₹1.3L");
    expect(formatReportAmount("25000000")).toBe("₹2.5Cr");
    expect(formatReportAmount("-1280")).toBe("₹1.3k");
    expect(formatReportAmount(null)).toBe("₹0");
    expect(formatReportAmount("oops")).toBe("₹0");
  });

  it("writes a day and month from the stored day", () => {
    expect(formatDayMonth("2026-10-04")).toBe("4 Oct");
    expect(formatDayMonth("")).toBe("");
    expect(formatDayMonth(null)).toBe("");
  });
});
