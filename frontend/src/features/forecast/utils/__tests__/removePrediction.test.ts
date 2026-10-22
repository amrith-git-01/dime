import type { ForecastResponse } from "../../types";
import { removePredictionFromForecast } from "../removePrediction";

const forecast = (): ForecastResponse => ({
  year: 2026,
  month: 10,
  today: "2026-10-22",
  timezone: "Asia/Kolkata",
  mode: "full",
  historyDays: 90,
  landing: {
    p10: "1.00",
    p50: "2.00",
    p90: "3.00",
    budget: null,
    chanceUnder: null,
    spentSoFar: "0.00",
    billsStillDue: "0.00",
    flexibleRemaining: "0.00",
  },
  safeToday: null,
  categories: [],
  upcoming: [
    { id: "u1", kind: "likely", name: "Swiggy", amount: "350.00", date: "2026-10-23", payeeKey: "swiggy", confidence: 0.8 },
    { id: "u2", kind: "likely", name: "Zomato", amount: "500.00", date: "2026-10-24", payeeKey: "zomato", confidence: 0.7 },
    { id: "u3", kind: "bill", name: "Swiggy One", amount: "100.00", date: "2026-10-25", payeeKey: "swiggy" },
  ],
  watch: [
    { id: "hot:c1", kind: "category_hot", text: "hot", categoryId: "c1" },
    { id: "unusual:t1", kind: "unusual", text: "odd", transactionId: "t1" },
    { id: "sub:spotify", kind: "subscription_candidate", text: "sub", payeeKey: "spotify" },
  ],
  summary: "",
  accuracy: null,
});

describe("removePredictionFromForecast", () => {
  it("drops a dismissed likely spend but not a bill of the same payee", () => {
    const next = removePredictionFromForecast(forecast(), {
      targetKind: "payee",
      targetId: "swiggy",
      verdict: "dismiss",
    });
    expect(next.upcoming.map((i) => i.id)).toEqual(["u2", "u3"]);
  });

  it("leaves a confirmed likely spend on screen", () => {
    const before = forecast();
    expect(
      removePredictionFromForecast(before, {
        targetKind: "payee",
        targetId: "swiggy",
        verdict: "confirm",
      }),
    ).toBe(before);
  });

  it.each([
    [{ targetKind: "unusual_txn", targetId: "t1", verdict: "one_off" }, "unusual:t1"],
    [{ targetKind: "unusual_txn", targetId: "t1", verdict: "not_one_off" }, "unusual:t1"],
    [{ targetKind: "category_watch", targetId: "c1", verdict: "dismiss" }, "hot:c1"],
    [{ targetKind: "subscription_candidate", targetId: "spotify", verdict: "confirm" }, "sub:spotify"],
    [{ targetKind: "subscription_candidate", targetId: "spotify", verdict: "dismiss" }, "sub:spotify"],
  ] as const)("takes %j off the watch list", (input, removedId) => {
    const next = removePredictionFromForecast(forecast(), input);
    expect(next.watch.map((i) => i.id)).not.toContain(removedId);
    expect(next.watch).toHaveLength(2);
  });
});
