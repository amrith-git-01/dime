import { AxiosError } from "axios";

import { dimeApi } from "@/lib/api/dimeApi";

import { FULL_SNAPSHOT } from "../__fixtures__/reportFixtures";
import {
  fetchReport,
  fetchReportList,
  isReportNotFound,
  mapReportSnapshot,
  markReportViewed,
} from "../api/reportsApi";
import { isReportSnapshot } from "../utils/snapshotShape";

jest.mock("@/lib/api/dimeApi", () => ({
  dimeApi: { get: jest.fn(), post: jest.fn() },
}));

const get = jest.mocked(dimeApi.get);
const post = jest.mocked(dimeApi.post);

function httpError(status: number): AxiosError {
  return new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data: {},
    statusText: "",
    headers: {},
    config: {} as never,
  });
}

function mapped(over: Record<string, unknown>) {
  const result = mapReportSnapshot({ ...FULL_SNAPSHOT, ...over });
  if (!result) {
    throw new Error("expected a snapshot");
  }
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("reportsApi", () => {
  it("reads the list from /reports", async () => {
    const items = [
      { period_key: "2026-10", year: 2026, month: 10, debit_count: 41, viewed: false },
    ];
    get.mockResolvedValueOnce({ data: { items } });
    await expect(fetchReportList()).resolves.toEqual(items);
    expect(get).toHaveBeenCalledWith("/api/v1/reports");
  });

  it("treats a malformed list answer as empty", async () => {
    get.mockResolvedValueOnce({ data: {} });
    await expect(fetchReportList()).resolves.toEqual([]);
  });

  it("maps list rows and drops the ones without a valid period", async () => {
    get.mockResolvedValueOnce({
      data: {
        items: [
          { period_key: "2026-10", year: 2026, month: 10, debit_count: "12", viewed: true },
          { period_key: "october" },
          null,
          { period_key: "2026-09", viewed: "yes" },
        ],
      },
    });
    await expect(fetchReportList()).resolves.toEqual([
      { period_key: "2026-10", year: 2026, month: 10, debit_count: 12, viewed: true },
      { period_key: "2026-09", year: 2026, month: 9, debit_count: 0, viewed: false },
    ]);
  });

  it("reads one snapshot by period", async () => {
    get.mockResolvedValueOnce({ data: FULL_SNAPSHOT });
    const snapshot = await fetchReport("2026-10");
    expect(get).toHaveBeenCalledWith("/api/v1/reports/2026-10");
    expect(snapshot).toEqual(FULL_SNAPSHOT);
  });

  it("answers null for a 404: no such report is a normal state", async () => {
    get.mockRejectedValueOnce(httpError(404));
    await expect(fetchReport("2026-09")).resolves.toBeNull();
  });

  it("still throws every other failure", async () => {
    get.mockRejectedValueOnce(httpError(500));
    await expect(fetchReport("2026-09")).rejects.toThrow();
    get.mockRejectedValueOnce(new Error("offline"));
    await expect(fetchReport("2026-09")).rejects.toThrow("offline");
  });

  it("throws on a 200 that is not a snapshot (retry), instead of calling it a missing report", async () => {
    get.mockResolvedValueOnce({ data: { hello: "world" } });
    await expect(fetchReport("2026-10")).rejects.toThrow("could not be read");
  });

  it("posts the viewed mark", async () => {
    post.mockResolvedValueOnce({ data: undefined });
    await markReportViewed("2026-10");
    expect(post).toHaveBeenCalledWith("/api/v1/reports/2026-10/viewed");
  });

  it("recognises a 404 only", () => {
    expect(isReportNotFound(httpError(404))).toBe(true);
    expect(isReportNotFound(httpError(403))).toBe(false);
    expect(isReportNotFound(new Error("x"))).toBe(false);
  });
});

describe("mapReportSnapshot", () => {
  it("leaves a good snapshot as it is", () => {
    expect(mapReportSnapshot(FULL_SNAPSHOT)).toEqual(FULL_SNAPSHOT);
  });

  it("is null for anything that is not a snapshot", () => {
    const bad = [
      null,
      undefined,
      7,
      "x",
      [],
      {},
      { ...FULL_SNAPSHOT, period_key: "soon" },
      { ...FULL_SNAPSHOT, version: "1" },
    ];
    for (const value of bad) {
      expect(mapReportSnapshot(value)).toBeNull();
      expect(isReportSnapshot(value)).toBe(false);
    }
    expect(isReportSnapshot(FULL_SNAPSHOT)).toBe(true);
  });

  it("fills the holes of a snapshot from another version", () => {
    const sparse = mapReportSnapshot({
      version: 2,
      period_key: "2026-10",
      year: 2026,
      month: 10,
      debit_count: 7,
    });
    expect(sparse).not.toBeNull();
    expect(sparse?.slides).toEqual([]);
    expect(sparse?.categories).toEqual([]);
    expect(sparse?.weekday.totals).toEqual(["0", "0", "0", "0", "0", "0", "0"]);
    expect(sparse?.win).toEqual({ kind: "none" });
    expect(sparse?.title).toEqual({ id: "steady", evidence: {} });
    expect(sparse?.top_payee).toBeNull();
    expect(sparse?.biggest_spend).toBeNull();
    expect(sparse?.busiest_day).toBeNull();
    expect(sparse?.spent).toBe("0");
    expect(sparse?.debit_count).toBe(7);
  });

  it("repairs category rows: names, numbers, junk rows", () => {
    const result = mapped({
      categories: [
        { id: "c1", name: null, amount: 1250, share: "0.4", count: "3", icon_name: 5, color: "" },
        { id: null, name: "", amount: "x", share: 7, count: -2 },
        "junk",
        null,
        { id: null, name: "Other", amount: "10.00", share: -1, count: 1.9 },
      ],
    });
    expect(result.categories).toEqual([
      { id: "c1", name: "Uncategorized", icon_name: null, color: null, amount: "1250", share: 0.4, count: 3 },
      { id: null, name: "Uncategorized", icon_name: null, color: null, amount: "0", share: 1, count: 0 },
      { id: null, name: "Other", icon_name: null, color: null, amount: "10.00", share: 0, count: 1 },
    ]);
    expect(mapped({ categories: "none" }).categories).toEqual([]);
  });

  it("drops a regular that cannot be shown", () => {
    expect(mapped({ top_payee: { display_name: "", count: 5, amount: "1" } }).top_payee).toBeNull();
    expect(mapped({ top_payee: { display_name: "Cafe", count: 0, amount: "1" } }).top_payee).toBeNull();
    expect(mapped({ top_payee: { count: 5 } }).top_payee).toBeNull();
    expect(mapped({ top_payee: "Cafe" }).top_payee).toBeNull();
    expect(mapped({ top_payee: { display_name: "Cafe", count: "4" } }).top_payee).toEqual({
      payee_key: "Cafe",
      display_name: "Cafe",
      count: 4,
      amount: "0",
    });
  });

  it("keeps the moment only when it has an amount (and a date for the busiest day)", () => {
    expect(mapped({ biggest_spend: { display_name: "Mall" } }).biggest_spend).toBeNull();
    expect(mapped({ biggest_spend: { amount: "900", display_name: null } }).biggest_spend).toEqual({
      amount: "900",
      display_name: "",
      category_name: "",
      date: "",
    });
    expect(mapped({ busiest_day: { amount: "900", count: 3 } }).busiest_day).toBeNull();
    expect(mapped({ busiest_day: { date: "2026-10-04", count: 3 } }).busiest_day).toBeNull();
    expect(mapped({ busiest_day: { date: "2026-10-04", amount: "900" } }).busiest_day).toEqual({
      date: "2026-10-04",
      amount: "900",
      count: 0,
    });
  });

  it("always gives seven weekday totals and a peak inside the week", () => {
    const zeros = ["0", "0", "0", "0", "0", "0", "0"];
    expect(mapped({ weekday: { totals: ["1", "2"], peak_index: 3, weekend_share: 0.2 } }).weekday.totals).toEqual(zeros);
    expect(
      mapped({ weekday: { totals: ["1", "2", "3", "4", "5", "6", "7", "8"] } }).weekday.totals,
    ).toEqual(zeros);
    expect(
      mapped({ weekday: { totals: [1, "b", null, "4", "5", "6", "7"], peak_index: 12, weekend_share: 5 } })
        .weekday,
    ).toEqual({
      totals: ["1", "0", "0", "4", "5", "6", "7"],
      peak_index: 6,
      weekend_share: 1,
    });
    expect(mapped({ weekday: null }).weekday.peak_index).toBe(0);
  });

  it("turns an unknown or malformed win into none", () => {
    const none = { kind: "none" };
    expect(mapped({ win: { kind: "jackpot" } }).win).toEqual(none);
    expect(mapped({ win: null }).win).toEqual(none);
    expect(mapped({ win: { kind: "category_down", delta: "100" } }).win).toEqual(none);
    expect(mapped({ win: { kind: "category_down", category_name: "Food" } }).win).toEqual(none);
    expect(mapped({ win: { kind: "no_spend_streak", days: 0 } }).win).toEqual(none);
    expect(mapped({ win: { kind: "lowest_month" } }).win).toEqual(none);
    expect(mapped({ win: { kind: "no_spend_streak", days: "4", start: 1, end: null } }).win).toEqual({
      kind: "no_spend_streak",
      days: 4,
      start: "",
      end: "",
    });
    expect(mapped({ win: { kind: "lowest_month", spent: "900", months_compared: 0 } }).win).toEqual({
      kind: "lowest_month",
      spent: "900",
      previous_lowest: "0",
      months_compared: 1,
    });
  });

  it("falls back to steady for an unknown title and keeps only plain evidence", () => {
    expect(mapped({ title: { id: "from_the_future", evidence: {} } }).title.id).toBe("steady");
    expect(mapped({ title: null }).title).toEqual({ id: "steady", evidence: {} });
    expect(
      mapped({
        title: { id: "loyalist", evidence: { visits: 9, name: "x", bad: { a: 1 }, nan: Number.NaN } },
      }).title,
    ).toEqual({ id: "loyalist", evidence: { visits: 9, name: "x" } });
  });

  it("reads up or down without a difference as no comparison", () => {
    expect(mapped({ vs_usual: "up", vs_usual_delta: null }).vs_usual).toBeNull();
    expect(mapped({ vs_usual: "sideways", vs_usual_delta: "5" }).vs_usual).toBeNull();
    expect(mapped({ vs_usual: "same", vs_usual_delta: null }).vs_usual).toBe("same");
    expect(mapped({ vs_usual: "down", vs_usual_delta: "1280.00" }).vs_usual).toBe("down");
  });

  it("keeps only string slide ids", () => {
    expect(mapped({ slides: ["cover", 4, null, "closing"] }).slides).toEqual(["cover", "closing"]);
    expect(mapped({ slides: "cover" }).slides).toEqual([]);
  });
});
