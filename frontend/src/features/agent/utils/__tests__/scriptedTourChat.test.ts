import { buildSampleSet } from "@/features/tourPreview";

import { buildScriptedTourAnswer } from "../scriptedTourChat";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

const set = buildSampleSet({ today: new Date(2026, 9, 15), timezone: "Asia/Kolkata" });
const rupees = (amount: number) => `₹${new Intl.NumberFormat("en-IN").format(amount)}`;

describe("the Ask AI tour's scripted answer", () => {
  const answer = buildScriptedTourAnswer(set);
  const donut = answer.blocks[0];
  const series = donut.type === "mini_chart" ? (donut.payload.series ?? []) : [];

  it("takes every figure from the tour's sample month (one source)", () => {
    const summary = set.current.monthSummary;
    const food = (summary.category_meta ?? []).find((meta) => meta.name === "Food & Dining");
    const foodSpend = Math.round(Number(summary.debit_by_category[food?.id ?? ""]));
    expect(foodSpend).toBeGreaterThan(0);
    expect(answer.answer).toContain(rupees(foodSpend));
    expect(answer.answer).toContain(rupees(Math.round(Number(summary.debit_total))));
  });

  it("splits the donut so it adds up to the sample month's spending", () => {
    expect(series.map((item) => item.name)).toEqual(["Food", "Shopping", "Transport", "Other"]);
    const total = series.reduce((sum, item) => sum + item.value, 0);
    expect(total).toBe(Math.round(Number(set.current.monthSummary.debit_total)));
    expect(series[0].value).toBe(7076);
  });

  it("compares with the sample's last month, not a made-up figure", () => {
    expect(answer.answer).toContain("about 18% less than last month");
    const flipped = buildScriptedTourAnswer({ current: set.previous, previous: set.current });
    expect(flipped.answer).toMatch(/about \d+% more than last month/);
  });

  it("is a plain answer with no server turn", () => {
    expect(answer.turn_id).toBeNull();
    expect(answer.deep_link).toBeNull();
    expect(answer.blocks).toHaveLength(1);
  });
});
