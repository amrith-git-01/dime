import { createElement, type ReactElement } from "react";

import type { ForecastResponse } from "@/features/forecast/types";

import { useAnalyticsScreenModel } from "../useAnalyticsScreenModel";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock("@/hooks/useTransactionQuickAddActions", () => ({
  useTransactionQuickAddActions: () => ({
    onManualAdd: jest.fn(),
    onReceipt: jest.fn(),
    onVoice: jest.fn(),
  }),
}));
jest.mock("@/hooks/useTourCommand", () => ({ useTourCommand: jest.fn() }));
jest.mock("@/hooks/useTourRestorable", () => ({ useTourRestorable: jest.fn() }));
jest.mock("@/lib/tour/tourEvents", () => ({
  emitTourEvent: jest.fn(),
  tourEventNames: { transactionOpened: "t", payeeOpened: "p" },
}));
jest.mock("@/features/analytics/hooks/useDeferredHeavyCharts", () => ({
  useDeferredHeavyCharts: () => ({ chartsReady: true }),
}));
jest.mock("@/features/budgets/hooks/useBudget", () => ({
  useBudgetQuery: () => ({
    data: { budget: { monthly_budget: "30000.00" } },
    isPending: false,
  }),
}));
jest.mock("@/features/recurring/hooks/useRecurringMonthQuery", () => ({
  useRecurringMonthQuery: () => ({
    data: undefined,
    isError: true,
    isSuccess: false,
    isPlaceholderData: false,
  }),
}));
jest.mock("@/features/analytics/hooks/useMonthInsightsQuery", () => ({
  useMonthInsightsQuery: (year: number, monthIndex0: number) => ({
    data: {
      year,
      month: monthIndex0 + 1,
      today: new Date().toISOString().slice(0, 10),
      summary: {
        credit_total: "50000.00",
        debit_total: "18620.00",
        net: "31380.00",
        transaction_count: 12,
        fixed_debit_total: "0.00",
      },
      daily_cashflow: [],
      counterparty_spend: [],
      counterparty_income: [],
      top_expenses: [],
    },
    isPending: false,
    isPlaceholderData: false,
    isError: false,
  }),
}));

let mockForecast: ForecastResponse | undefined;
const mockUseForecastQuery = jest.fn();
jest.mock("@/features/forecast/hooks/useForecastQuery", () => ({
  useForecastQuery: (year: number, monthIndex0: number) => mockUseForecastQuery(year, monthIndex0),
}));
const mockAnswer = jest.fn();
jest.mock("@/features/forecast/hooks/usePredictionFeedback", () => ({
  usePredictionFeedback: () => ({ mutate: mockAnswer }),
}));
jest.mock("@/features/toast/useToast", () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

let model: ReturnType<typeof useAnalyticsScreenModel> | undefined;
function Probe() {
  model = useAnalyticsScreenModel();
  return null;
}
const current = () => {
  if (!model) throw new Error("not rendered");
  return model;
};

const forecast = (p50: string): ForecastResponse =>
  ({
    year: 2026,
    month: 10,
    today: "2026-10-22",
    timezone: "Asia/Kolkata",
    mode: "full",
    historyDays: 90,
    landing: {
      p10: "27000.00",
      p50,
      p90: "31000.00",
      budget: "30000.00",
      chanceUnder: 0.7,
      spentSoFar: "18620.00",
      billsStillDue: "0.00",
      flexibleRemaining: "10000.00",
    },
    safeToday: null,
    categories: [{ id: "c-food", name: "Food", iconName: null, color: null, spent: "1.00", p50: "2.00", budget: null, baseline: null, status: "hot" }],
    upcoming: [],
    watch: [],
    summary: "",
    accuracy: null,
  }) as ForecastResponse;

async function mount() {
  let renderer!: { unmount: () => void };
  await act(async () => {
    renderer = create(createElement(Probe));
  });
  return renderer;
}

describe("the Insights screen model's Ahead section", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockAnswer.mockReset();
    mockForecast = forecast("28900.00");
    mockUseForecastQuery.mockImplementation(() => ({
      data: mockForecast,
      isError: false,
      refetch: jest.fn(),
    }));
  });

  it("looks ahead on the current month only", async () => {
    const renderer = await mount();
    expect(current().selectedMonthIndex).toBe(0);
    expect(current().ahead.visible).toBe(true);
    expect(current().ahead.forecast).toBe(mockForecast);

    await act(async () => {
      current().goPrevMonth();
    });
    expect(current().ahead.visible).toBe(false);
    expect(current().ahead.forecast).toBeUndefined();
    expect(current().ahead.loading).toBe(false);
    await act(async () => {
      renderer.unmount();
    });
  });

  it("projects the month's net from the forecast's middle figure", async () => {
    const renderer = await mount();
    // 50,000 credited, nothing expected, 28,900 forecast to be spent.
    expect(current().summary?.projectedNetValue).toBeCloseTo(50000 - 28900);
    await act(async () => {
      renderer.unmount();
    });
  });

  it("does not project from a forecast that is still learning", async () => {
    mockForecast = { ...forecast("28900.00"), mode: "learning" };
    const renderer = await mount();
    expect(current().ahead.projectedSpend).toBeNull();
    expect(current().summary?.projectedNetValue).not.toBeCloseTo(50000 - 28900);
    await act(async () => {
      renderer.unmount();
    });
  });

  it("falls back to the straight-line pace while there is no forecast", async () => {
    mockForecast = undefined;
    const renderer = await mount();
    expect(current().ahead.projectedSpend).toBeNull();
    expect(current().ahead.loading).toBe(true);
    expect(current().summary?.projectedNetValue).not.toBeCloseTo(50000 - 28900);
    await act(async () => {
      renderer.unmount();
    });
  });

  it("opens the add screen prefilled from the suggestion, without confirming it yet", async () => {
    const renderer = await mount();
    current().ahead.actions.onTrackRecurring({
      id: "sub:spotify",
      kind: "subscription_candidate",
      text: "Spotify, ₹119 yearly. Track it as recurring?",
      payeeKey: "spotify",
      name: "Spotify",
      cadence: "yearly",
      amount: "119.00",
      dayOfMonth: 9,
    });
    // Cancelling the editor leaves the suggestion where it was: the editor confirms once the item is saved.
    expect(mockAnswer).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("RecurringEditor", {
      kind: "subscription",
      prefill: {
        name: "Spotify",
        amount: "119.00",
        dayOfMonth: 9,
        cadence: "yearly",
        feedbackPayeeKey: "spotify",
      },
    });
    await act(async () => {
      renderer.unmount();
    });
  });

  it("answers a likely spend and a hot category, and opens the category's transactions", async () => {
    const renderer = await mount();
    const { actions } = current().ahead;
    actions.onDismissLikely({ id: "u1", kind: "likely", name: "Swiggy", amount: "1.00", date: "2026-10-23", payeeKey: "swiggy" });
    expect(mockAnswer).toHaveBeenCalledWith({ targetKind: "payee", targetId: "swiggy", verdict: "dismiss" });

    actions.onDismissCategoryWatch({ id: "hot:c-food", kind: "category_hot", text: "", categoryId: "c-food" });
    expect(mockAnswer).toHaveBeenCalledWith({ targetKind: "category_watch", targetId: "c-food", verdict: "dismiss" });

    actions.onSeeCategoryTransactions({ id: "hot:c-food", kind: "category_hot", text: "", categoryId: "c-food" });
    expect(mockNavigate).toHaveBeenCalledWith(
      "TransactionsList",
      expect.objectContaining({ filter: "category", categoryId: "c-food", categoryDisplayName: "Food" }),
    );
    await act(async () => {
      renderer.unmount();
    });
  });

  it("never sends an answer for a guided-tour sample card", async () => {
    const renderer = await mount();
    current().ahead.actions.onDismissLikely({
      id: "5a3b1e00-0000-4000-8000-000000000300",
      kind: "likely",
      name: "Swiggy",
      amount: "1.00",
      date: "2026-10-23",
      payeeKey: "swiggy",
    });
    expect(mockAnswer).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });
});
