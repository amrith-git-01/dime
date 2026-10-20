import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactElement } from "react";

import { useMonthInsightsQuery } from "@/features/analytics/hooks/useMonthInsightsQuery";
import { useBudgetQuery } from "@/features/budgets/hooks/useBudget";
import { useCategoryBudgetsQuery } from "@/features/budgets/hooks/useCategoryBudgetsQuery";
import { useRecurringMonthQuery } from "@/features/recurring/hooks/useRecurringMonthQuery";
import { useRecurringQuery } from "@/features/recurring/hooks/useRecurringQuery";
import {
  useMonthDebitTotalsByCategoryQuery,
  useMonthSummaryQuery,
  useTransactionsHomeQuery,
  useTransactionsMonthInfiniteQuery,
} from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import {
  endTourPreview,
  startTourPreviewIfEmpty,
  useTourPreviewStore,
} from "../store/tourPreviewStore";
import { TOUR_SAMPLE_ID_PREFIX } from "../utils/sampleIds";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
// The budget hooks reach for notification permissions on save; native modules are not available here.
jest.mock("@/features/onboarding/utils/askNotificationsInContext", () => ({
  askNotificationsInContext: jest.fn(),
}));

const mockSession: { userId: string | undefined } = { userId: "user-a" };
jest.mock("@/stores/authSessionStore", () => ({
  useAuthSessionStore: {
    getState: () => ({ userId: mockSession.userId }),
    subscribe: () => () => undefined,
  },
}));
jest.mock("@/hooks/useSessionUserId", () => ({
  useSessionUserId: () => ({ userId: mockSession.userId }),
}));
jest.mock("@/hooks/useCurrentDay", () => ({
  useCurrentDay: () => new Date(2026, 9, 15),
}));

const EMPTY_SUMMARY = {
  credit_total: "0",
  debit_total: "0",
  net: "0",
  transaction_count: 0,
  fixed_debit_total: "0",
  flexible_debit_total: "0",
  fixed_credit_total: "0",
  flexible_credit_total: "0",
  debit_by_category: {},
  category_meta: [],
};

/** What the API returns for an account with nothing in it. */
const mockEmptyAccount: Record<string, unknown> = {
  "/api/v1/transactions/home": {
    spent_today: "0",
    spent_this_month: "0",
    top_categories: [],
    recent_transactions: [],
    last_7_days_spend: [],
  },
  "/api/v1/transactions/month-summary": EMPTY_SUMMARY,
  "/api/v1/transactions": { items: [], has_more: false, day_summaries: {} },
  "/api/v1/transactions/month-insights": {
    year: 2026,
    month: 10,
    summary: EMPTY_SUMMARY,
    daily_cashflow: [],
    counterparty_spend: [],
    counterparty_income: [],
    top_expenses: [],
  },
  "/api/v1/recurring": {
    items: [],
    summary: { monthly_income_total: "0", monthly_subscriptions_total: "0" },
  },
  "/api/v1/recurring/month": {
    year: 2026,
    month: 10,
    items: [],
    totals: {
      fixed_expense_paid: "0",
      fixed_expense_upcoming: "0",
      fixed_income_received: "0",
      fixed_income_upcoming: "0",
    },
  },
  "/api/v1/budget": { budget: null },
  "/api/v1/budget/categories": { items: [] },
};

jest.mock("@/lib/api/dimeApi", () => ({
  dimeApi: {
    get: (url: string) => {
      const data = mockEmptyAccount[url];
      return data === undefined
        ? Promise.reject(new Error(`unexpected GET ${url}`))
        : Promise.resolve({ data });
    },
  },
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

// Month index 9 is October 2026 ("today" is the 15th); index 8 is last month.
type Screens = ReturnType<typeof useAllPreviewedQueries>;

function useAllPreviewedQueries() {
  return {
    home: useTransactionsHomeQuery(),
    summary: useMonthSummaryQuery(2026, 9),
    lastMonthSummary: useMonthSummaryQuery(2026, 8),
    debitByCategory: useMonthDebitTotalsByCategoryQuery(2026, 9),
    monthList: useTransactionsMonthInfiniteQuery(2026, 9),
    filteredMonthList: useTransactionsMonthInfiniteQuery(2026, 9, {
      filters: { payee: "zomato" },
    }),
    income: useRecurringQuery("income"),
    subscriptions: useRecurringQuery("subscription"),
    recurringMonth: useRecurringMonthQuery(2026, 9),
    lastMonthRecurring: useRecurringMonthQuery(2026, 8),
    budget: useBudgetQuery(),
    categoryBudgets: useCategoryBudgetsQuery(),
    insights: useMonthInsightsQuery(2026, 9),
  };
}

let latest: Screens | undefined;

function Probe() {
  latest = useAllPreviewedQueries();
  return null;
}

const screens = (): Screens => {
  if (!latest) throw new Error("not rendered");
  return latest;
};

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

function cacheDump(client: QueryClient): string {
  return JSON.stringify(
    client
      .getQueryCache()
      .getAll()
      .map((query) => ({ key: query.queryKey, data: query.state.data })),
  );
}

describe("tour sample data stays out of the cache", () => {
  let client: QueryClient;
  let renderer: { unmount: () => void };

  beforeEach(async () => {
    mockSession.userId = "user-a";
    useTourPreviewStore.setState({ active: false, userId: undefined, suspended: false });
    latest = undefined;
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    await act(async () => {
      renderer = create(
        createElement(QueryClientProvider, { client }, createElement(Probe)),
      );
    });
    await flush();
    await flush();
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
    client.clear();
  });

  it("shows the real (empty) data before the tour", () => {
    expect(screens().home.data?.recent_transactions).toEqual([]);
    expect(screens().summary.data?.transaction_count).toBe(0);
    expect(cacheDump(client)).not.toContain(TOUR_SAMPLE_ID_PREFIX);
  });

  it("serves sample data through the same hooks while it is on, and writes none of it", async () => {
    expect(client.getQueryData(transactionsQueryKeys.home("user-a", getDeviceIanaTimezone()))).toBeDefined();
    const before = cacheDump(client);

    act(() => {
      startTourPreviewIfEmpty(client, "user-a");
    });
    await flush();
    expect(useTourPreviewStore.getState()).toMatchObject({ active: true, userId: "user-a" });

    const s = screens();
    expect(s.home.data?.recent_transactions).toHaveLength(5);
    expect(s.home.data?.recent_transactions[0].id.startsWith(TOUR_SAMPLE_ID_PREFIX)).toBe(true);
    expect(s.home.isPending).toBe(false);
    expect(s.summary.data?.transaction_count).toBeGreaterThan(0);
    expect(Object.keys(s.debitByCategory.data ?? {}).length).toBeGreaterThan(0);
    expect(s.monthList.data?.pages[0].items.length).toBeGreaterThan(0);
    expect(s.income.data?.items.map((item) => item.name)).toEqual(["Salary"]);
    expect(s.subscriptions.data?.items.map((item) => item.name)).toEqual(["Rent", "Netflix"]);
    expect(s.recurringMonth.data?.items).toHaveLength(3);
    expect(s.budget.data?.budget?.monthly_budget).toBe("30000.00");
    expect(s.categoryBudgets.data?.length).toBeGreaterThan(0);
    expect(s.insights.data?.daily_cashflow).toHaveLength(31);

    // Other months and filtered lists stay real.
    expect(s.lastMonthSummary.data?.transaction_count).toBe(0);
    expect(s.lastMonthRecurring.data?.items).toEqual([]);
    expect(s.filteredMonthList.data?.pages[0].items).toEqual([]);

    // The preview ends.
    act(() => {
      endTourPreview();
    });
    await flush();
    expect(useTourPreviewStore.getState().active).toBe(false);

    // Back to the real data, and nothing sample-tagged ever reached the cache.
    expect(screens().home.data?.recent_transactions).toEqual([]);
    expect(screens().summary.data?.transaction_count).toBe(0);
    expect(screens().income.data?.items).toEqual([]);
    expect(cacheDump(client)).not.toContain(TOUR_SAMPLE_ID_PREFIX);
    expect(cacheDump(client)).toBe(before);
  });

  it("ending the preview returns to the real data", async () => {
    act(() => {
      startTourPreviewIfEmpty(client, "user-a");
    });
    await flush();
    expect(screens().home.data?.recent_transactions).toHaveLength(5);

    act(() => {
      endTourPreview();
    });
    await flush();
    expect(screens().home.data?.recent_transactions).toEqual([]);
    expect(cacheDump(client)).not.toContain(TOUR_SAMPLE_ID_PREFIX);
  });

  it("shows real data while the tour is hidden, and sample data again when it returns", async () => {
    act(() => {
      startTourPreviewIfEmpty(client, "user-a");
    });
    await flush();
    act(() => {
      useTourPreviewStore.setState({ suspended: true });
    });
    await flush();
    expect(screens().home.data?.recent_transactions).toEqual([]);

    act(() => {
      useTourPreviewStore.setState({ suspended: false });
    });
    await flush();
    expect(screens().home.data?.recent_transactions).toHaveLength(5);
  });

  it("never shows another account's preview", async () => {
    act(() => {
      startTourPreviewIfEmpty(client, "user-a");
    });
    await flush();
    expect(screens().home.data?.recent_transactions).toHaveLength(5);

    // A different account is signed in while the latch is still set (before it clears).
    mockSession.userId = "user-b";
    await act(async () => {
      renderer.unmount();
      renderer = create(
        createElement(QueryClientProvider, { client }, createElement(Probe)),
      );
    });
    await flush();
    expect(screens().home.data?.recent_transactions).toEqual([]);
  });

  it("does not preview for an account that already has activity", async () => {
    client.setQueryData(transactionsQueryKeys.home("user-a", getDeviceIanaTimezone()), {
      spent_today: "0",
      spent_this_month: "250.00",
      top_categories: [],
      recent_transactions: [],
    });
    act(() => {
      startTourPreviewIfEmpty(client, "user-a");
    });
    await flush();
    expect(useTourPreviewStore.getState().active).toBe(false);
    expect(screens().summary.data?.transaction_count).toBe(0);
  });
});
