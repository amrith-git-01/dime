import { buildSampleSet, isTourSampleId } from "@/features/tourPreview";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

describe("the guided tour's sample forecast", () => {
  const today = new Date(2026, 9, 22);
  const set = buildSampleSet({ today, now: new Date(2026, 9, 22, 12), timezone: "Asia/Kolkata" });
  const forecast = set.current.forecast;

  it("describes the sample month in the API's shape", () => {
    expect(forecast.year).toBe(2026);
    expect(forecast.month).toBe(10);
    expect(forecast.today).toBe("2026-10-22");
    expect(forecast.mode).toBe("full");
    expect(forecast.landing.spentSoFar).toBe(set.current.monthSummary.debit_total);
    expect(forecast.landing.budget).toBe("30000.00");
    const [p10, p50, p90] = [forecast.landing.p10, forecast.landing.p50, forecast.landing.p90].map(Number);
    expect(p10).toBeLessThanOrEqual(p50!);
    expect(p50).toBeLessThanOrEqual(p90!);
    expect(forecast.safeToday?.weekday).toBe("Thu");
  });

  it("has a full Ahead: likely spends, categories and every kind of watch card", () => {
    expect(forecast.upcoming.filter((item) => item.kind === "likely").length).toBeGreaterThan(0);
    expect(forecast.categories.length).toBeGreaterThan(0);
    expect(forecast.watch.map((item) => item.kind).sort()).toEqual([
      "category_hot",
      "subscription_candidate",
      "unusual",
    ]);
    expect(forecast.accuracy).not.toBeNull();
  });

  it("marks every card as a sample so answering one never reaches the server", () => {
    for (const item of [...forecast.upcoming, ...forecast.watch]) {
      expect(isTourSampleId(item.id)).toBe(true);
    }
  });

  it("points the unusual card at a payment the sample Insights actually lists", () => {
    const unusual = forecast.watch.find((item) => item.kind === "unusual");
    expect(set.current.insights.top_expenses.map((row) => row.id)).toContain(unusual?.transactionId);
  });
});
