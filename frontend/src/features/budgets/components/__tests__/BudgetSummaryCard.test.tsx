import {
  renderTree,
  textsOf,
  unmountTree,
} from "@/features/brokeReport/components/__tests__/testHarness";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { formatInrCompact } from "@/utils/currency";

import { BudgetSummaryCard } from "../BudgetSummaryCard";
import type { BudgetMonthBentoSummary } from "../bento/BudgetMonthBentoSummary";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
  LinearTransition: {
    springify: () => ({ damping: () => ({ stiffness: () => ({ mass: () => ({}) }) }) }),
  },
}));

const money = formatInrCompact;

function summary(over: Partial<BudgetMonthBentoSummary> = {}): BudgetMonthBentoSummary {
  return {
    budgetDisplay: money(58000),
    spentDisplay: money(9509),
    remainingDisplay: money(48491),
    spentValue: 9509,
    budgetValue: 58000,
    remainingValue: 48491,
    isOverBudget: false,
    overageDisplay: money(0),
    usagePct: 0.16,
    usagePercentUsed: 16,
    usageLabel: "16% used",
    fixedSpent: 350,
    flexibleSpent: 9159,
    upcomingRecurring: 36953,
    ...over,
  };
}

function props(over: Record<string, unknown> = {}) {
  return {
    selectedMonth: "Nov 2026",
    canGoPrevMonth: true,
    canGoNextMonth: false,
    onPrevMonth: jest.fn(),
    onNextMonth: jest.fn(),
    hasMonthlyBudget: true,
    summary: summary(),
    summaryLoading: false,
    summaryFailed: false,
    onEditBudget: jest.fn(),
    onSetBudget: jest.fn(),
    ...over,
  };
}

async function textOf(over: Record<string, unknown> = {}) {
  const tree = await renderTree(
    <ThemeProvider>
      <BudgetSummaryCard {...props(over)} />
    </ThemeProvider>,
  );
  const joined = textsOf(tree).join("|");
  unmountTree(tree);
  return joined;
}

describe("BudgetSummaryCard", () => {
  it("leads with what is left, then one meta line and one legend line", async () => {
    const text = await textOf();
    expect(text).toContain("MONTHLY REMAINING");
    expect(text).toContain(money(48491));
    expect(text).toContain(`${money(9509)} spent of ${money(58000)} · `);
    expect(text).toContain("16% used");
    expect(text).toContain("Recurring");
    expect(text).toContain("Flexible");
    expect(text).toContain("Still to come");
    expect(text).toContain(money(36953));
  });

  it("drops the old Budget / Spent columns, the percent pill and the View link", async () => {
    const text = await textOf();
    expect(text.split("|")).not.toContain("Budget");
    expect(text.split("|")).not.toContain("Spent");
    expect(text).not.toContain("View");
  });

  it("leaves 'Still to come' out when nothing recurring is left", async () => {
    const text = await textOf({ summary: summary({ upcomingRecurring: 0 }) });
    expect(text).not.toContain("Still to come");
  });

  it("over budget: shows the overage and the over-budget wording in the meta line", async () => {
    const text = await textOf({
      summary: summary({
        isOverBudget: true,
        overageDisplay: money(2000),
        spentDisplay: money(60000),
        usagePercentUsed: 103,
        usagePct: 1,
      }),
    });
    expect(text).toContain(`${money(2000)} over`);
    expect(text).toContain("103% — over budget");
  });

  it("warns at 80 to 99 percent", async () => {
    const text = await textOf({ summary: summary({ usagePercentUsed: 91 }) });
    expect(text).toContain("91% — watch it");
  });

  it("without a budget it keeps the set-budget button and shows the shared legend", async () => {
    const text = await textOf({ hasMonthlyBudget: false, summary: summary({ budgetValue: 0 }) });
    expect(text).toContain("spent so far · no budget set");
    expect(text).toContain("Set monthly budget");
    expect(text).toContain("Recurring");
    expect(text).toContain("recurring still to come");
    expect(text).not.toContain("View");
  });
});
