import {
  renderTree,
  textsOf,
  unmountTree,
} from "@/features/brokeReport/components/__tests__/testHarness";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { formatInrCompact } from "@/utils/currency";

import {
  InsightsMonthSummaryCard,
  type InsightsMonthSummary,
} from "../InsightsMonthSummaryCard";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));

const money = formatInrCompact;

function summary(over: Partial<InsightsMonthSummary> = {}): InsightsMonthSummary {
  return {
    transactionCount: 5,
    hasMonthlyBudget: true,
    hasIncome: false,
    isOverBudget: false,
    budgetDisplay: money(30000),
    budgetValue: 30000,
    usedPctDisplay: "19%",
    remainingValue: 24300,
    remainingLabel: "Remaining",
    remainingDisplay: money(24300),
    spentDisplay: money(5700),
    incomeDisplay: money(0),
    netDisplay: money(0),
    budgetLeft: 24300,
    netValue: 0,
    savingsRatePct: null,
    hasFixed: true,
    fixedDisplay: money(2000),
    flexibleDisplay: money(3700),
    fixedValue: 2000,
    flexibleValue: 3700,
    expectedIncomeDisplay: null,
    ...over,
  };
}

async function textOf(over: Partial<InsightsMonthSummary> = {}) {
  const tree = await renderTree(
    <ThemeProvider>
      <InsightsMonthSummaryCard
        summary={summary(over)}
        summaryLoading={false}
        summaryFailed={false}
      />
    </ThemeProvider>,
  );
  const texts = textsOf(tree);
  unmountTree(tree);
  return texts;
}

describe("InsightsMonthSummaryCard", () => {
  it("with a budget: one breakdown row, no separate budget line", async () => {
    const texts = await textOf();
    expect(texts).toContain("Recurring");
    expect(texts).toContain("Flexible");
    expect(texts).toContain(`Left of ${money(30000)}`);
    expect(texts).toContain(money(24300));
    expect(texts.join("")).not.toContain("% used");
    expect(texts.join("")).not.toContain("Budget ₹");
  });

  it("over budget: Over by with the overage", async () => {
    const texts = await textOf({
      isOverBudget: true,
      fixedValue: 10000,
      flexibleValue: 32000,
      remainingValue: 0,
      // The server's signed figure drives the over-budget state.
      budgetLeft: -12000,
    });
    expect(texts).toContain("Over by");
    expect(texts).toContain(money(12000));
    expect(texts.join("")).not.toContain("Left of");
  });

  it("headlines what was spent: income and net sit beside it, never in its place", async () => {
    const texts = await textOf({
      hasIncome: true,
      incomeDisplay: money(95000),
      netDisplay: money(89300),
      netValue: 89300,
    });
    expect(texts.slice(0, 3)).toEqual(["THIS MONTH", money(5700), "spent"]);
    expect(texts).toContain("Income");
    expect(texts).toContain("Net");
    expect(texts).toContain(money(89300));
  });

  it("without a budget: two columns", async () => {
    const texts = await textOf({ hasMonthlyBudget: false, budgetValue: 0 });
    expect(texts).toContain("Recurring");
    expect(texts).toContain("Flexible");
    expect(texts.join("")).not.toContain("Left of");
    expect(texts.join("")).not.toContain("Over by");
  });

  it("keeps Expected income as its own line", async () => {
    const texts = await textOf({ expectedIncomeDisplay: money(50000) });
    expect(texts).toContain(`Expected income ${money(50000)}`);
  });

  it("with a budget but nothing recurring, still shows the breakdown", async () => {
    const texts = await textOf({ hasFixed: false, fixedValue: 0, flexibleValue: 3700 });
    expect(texts).toContain(`Left of ${money(30000)}`);
  });
});
