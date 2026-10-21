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
  useTransactionsRangeInfiniteQuery,
} from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import { useTransactionDetailQuery } from "@/features/transactions/hooks/useTransactionDetailQuery";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import type { TransactionRow } from "@/features/transactions/types";

import {
  endTourPreview,
  startTourPreview,
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
// "Today" is the 15th of October 2026, the same Date every render.
jest.mock("@/hooks/useCurrentDay", () => {
  const today = new Date(2026, 9, 15);
  return { useCurrentDay: () => today };
});
jest.mock("@/utils/deviceTimezone", () => ({
  getDeviceIanaTimezone: () => "Asia/Kolkata",
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
function emptyAccount(): Record<string, unknown> {
  return {
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
}

let mockApi: Record<string, unknown> = emptyAccount();
const mockGet = jest.fn((url: string) => {
  const data = mockApi[url];
  if (data instanceof Promise) {
    return data;
  }
  return data === undefined
    ? Promise.reject(new Error(`unexpected GET ${url}`))
    : Promise.resolve({ data });
});
jest.mock("@/lib/api/dimeApi", () => ({
  dimeApi: { get: (url: string) => mockGet(url) },
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

// Month index 9 is October 2026 ("today" is the 15th); index 8 is last month.
type Screens = ReturnType<typeof useAllPreviewedQueries>;

const dayStart = (day: number) => new Date(2026, 9, day).toISOString();

function useAllPreviewedQueries() {
  return {
    home: useTransactionsHomeQuery(),
    summary: useMonthSummaryQuery(2026, 9),
    lastMonthSummary: useMonthSummaryQuery(2026, 8),
    debitByCategory: useMonthDebitTotalsByCategoryQuery(2026, 9),
    monthList: useTransactionsMonthInfiniteQuery(2026, 9),
    zomatoList: useTransactionsMonthInfiniteQuery(2026, 9, { filters: { payee: "zomato" } }),
    dayList: useTransactionsRangeInfiniteQuery(dayStart(14), dayStart(15)),
    income: useRecurringQuery("income"),
    subscriptions: useRecurringQuery("subscription"),
    recurringMonth: useRecurringMonthQuery(2026, 9),
    lastMonthRecurring: useRecurringMonthQuery(2026, 8),
    budget: useBudgetQuery(),
    categoryBudgets: useCategoryBudgetsQuery(),
    insights: useMonthInsightsQuery(2026, 9),
    lastMonthInsights: useMonthInsightsQuery(2026, 8),
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

const ALL_DOMAINS = ["transactions", "budget", "recurring"] as const;

describe("tour sample data", () => {
  let client: QueryClient;
  let renderer: { unmount: () => void };

  async function mount() {
    latest = undefined;
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    await act(async () => {
      renderer = create(createElement(QueryClientProvider, { client }, createElement(Probe)));
    });
    await flush();
    await flush();
  }

  beforeEach(() => {
    mockSession.userId = "user-a";
    mockApi = emptyAccount();
    mockGet.mockClear();
    endTourPreview();
    useTourPreviewStore.setState({ shown: 0, accountEmpty: null });
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
    client.clear();
    endTourPreview();
  });

  describe("for an account with nothing in it", () => {
    beforeEach(mount);

    it("shows the real (empty) data before a tour", () => {
      expect(screens().home.data?.recent_transactions).toEqual([]);
      expect(screens().summary.data?.transaction_count).toBe(0);
      expect(cacheDump(client)).not.toContain(TOUR_SAMPLE_ID_PREFIX);
    });

    it("serves sample data through the same hooks while a tour runs, and writes none of it", async () => {
      const before = cacheDump(client);

      act(() => {
        startTourPreview("user-a", ALL_DOMAINS);
      });
      await flush();

      const s = screens();
      expect(s.home.data?.recent_transactions).toHaveLength(5);
      expect(s.home.data?.recent_transactions[0].id.startsWith(TOUR_SAMPLE_ID_PREFIX)).toBe(true);
      expect(s.home.isPending).toBe(false);
      expect(s.summary.data?.transaction_count).toBeGreaterThan(0);
      expect(Object.keys(s.debitByCategory.data ?? {}).length).toBeGreaterThan(0);
      expect(s.monthList.data?.pages[0].items.length).toBeGreaterThan(0);
      expect(s.income.data?.items.map((item) => item.name)).toEqual(["Salary"]);
      expect(s.subscriptions.data?.items.map((item) => item.name)).toEqual([
        "Broadband",
        "Netflix",
      ]);
      expect(s.recurringMonth.data?.items).toHaveLength(3);
      expect(s.budget.data?.budget?.monthly_budget).toBe("30000.00");
      expect(s.categoryBudgets.data?.length).toBeGreaterThan(0);
      expect(s.insights.data?.daily_cashflow).toHaveLength(31);

      // Nothing sample-tagged reached the cache, and the cache is exactly as before.
      expect(cacheDump(client)).not.toContain(TOUR_SAMPLE_ID_PREFIX);
      expect(cacheDump(client)).toBe(before);

      // The preview ends: back to the real data.
      act(() => {
        endTourPreview();
      });
      await flush();
      expect(useTourPreviewStore.getState().active).toBe(false);
      expect(screens().home.data?.recent_transactions).toEqual([]);
      expect(screens().summary.data?.transaction_count).toBe(0);
      expect(screens().income.data?.items).toEqual([]);
      expect(cacheDump(client)).toBe(before);
    });

    it("also covers last month, so the arrows and compare have something to show", async () => {
      act(() => {
        startTourPreview("user-a", ALL_DOMAINS);
      });
      await flush();
      expect(screens().lastMonthSummary.data?.transaction_count).toBeGreaterThan(0);
      expect(screens().lastMonthInsights.data?.summary.transaction_count).toBeGreaterThan(0);
      expect(screens().lastMonthRecurring.data?.items.length).toBeGreaterThan(0);
      // Last month costs a little more, so a comparison has a story.
      expect(Number(screens().lastMonthSummary.data?.debit_total)).toBeGreaterThan(
        Number(screens().summary.data?.debit_total),
      );
    });

    it("narrows a filtered list (a payee) to the sample rows that match", async () => {
      act(() => {
        startTourPreview("user-a", ALL_DOMAINS);
      });
      await flush();
      const rows = screens().zomatoList.data?.pages[0].items ?? [];
      expect(rows.length).toBe(3);
      expect(rows.every((row) => row.merchant === "Zomato")).toBe(true);
    });

    it("shows a transactions list at once, without waiting for a real answer that has not come", async () => {
      await act(async () => {
        renderer.unmount();
      });
      mockApi["/api/v1/transactions"] = new Promise(() => undefined);
      await mount();
      expect(screens().monthList.isPending).toBe(true);
      act(() => {
        startTourPreview("user-a", ALL_DOMAINS);
      });
      await flush();
      expect(screens().monthList.isPending).toBe(false);
      expect(screens().monthList.data?.pages[0].items.length).toBeGreaterThan(0);
      expect(screens().zomatoList.data?.pages[0].items).toHaveLength(3);
    });

    it("gives a day's list (a date range) the sample rows that fall inside it", async () => {
      act(() => {
        startTourPreview("user-a", ALL_DOMAINS);
      });
      await flush();
      const rows = screens().dayList.data?.pages[0].items ?? [];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.transaction_at >= dayStart(14)).toBe(true);
        expect(row.transaction_at < dayStart(15)).toBe(true);
      }
    });

    it("shows only the kinds of data the tour may show", async () => {
      act(() => {
        startTourPreview("user-a", ["transactions", "budget"]);
      });
      await flush();
      expect(screens().budget.data?.budget?.monthly_budget).toBe("30000.00");
      expect(screens().home.data?.recent_transactions).toHaveLength(5);
      expect(screens().income.data?.items).toEqual([]);
    });

    it("never samples a budget or recurring items unless transactions are sampled too", async () => {
      act(() => {
        startTourPreview("user-a", ["budget", "recurring"]);
      });
      await flush();
      expect(screens().budget.data?.budget).toBeNull();
      expect(screens().subscriptions.data?.items).toEqual([]);
      expect(screens().home.data?.recent_transactions).toEqual([]);
    });

    it("decides once, for the account: later activity does not change the screens mid-tour", async () => {
      act(() => {
        startTourPreview("user-a", ALL_DOMAINS);
      });
      await flush();
      expect(useTourPreviewStore.getState().accountEmpty).toBe(true);
      // Real activity appears in the cache while the tour runs (a refetch): the decision stands.
      act(() => {
        client.setQueryData(
          transactionsQueryKeys.home("user-a", "Asia/Kolkata"),
          { ...(mockApi["/api/v1/transactions/home"] as object), spent_this_month: "99.00" },
        );
      });
      await flush();
      expect(useTourPreviewStore.getState().accountEmpty).toBe(true);
      expect(screens().subscriptions.data?.items.length).toBeGreaterThan(0);
    });

    it("shows real data while the tour is hidden, and sample data again when it returns", async () => {
      act(() => {
        startTourPreview("user-a", ALL_DOMAINS);
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
        startTourPreview("user-a", ALL_DOMAINS);
      });
      await flush();
      expect(screens().home.data?.recent_transactions).toHaveLength(5);

      // A different account is signed in while the latch is still set (before it clears).
      mockSession.userId = "user-b";
      await act(async () => {
        renderer.unmount();
        renderer = create(createElement(QueryClientProvider, { client }, createElement(Probe)));
      });
      await flush();
      expect(screens().home.data?.recent_transactions).toEqual([]);
    });

    it("counts the pill's sample users and lets go of them when the preview ends", async () => {
      act(() => {
        startTourPreview("user-a", ALL_DOMAINS);
      });
      await flush();
      expect(useTourPreviewStore.getState().shown).toBeGreaterThan(0);
      act(() => {
        endTourPreview();
      });
      await flush();
      expect(useTourPreviewStore.getState().shown).toBe(0);
    });
  });

  describe("only for an account with no transactions, and screens with no data of their own", () => {
    it("an account with real spending sees real data everywhere, and the empty budget state", async () => {
      const realRow = { id: "real-1", merchant: "Chai Point" } as TransactionRow;
      mockApi["/api/v1/transactions/home"] = {
        spent_today: "50.00",
        spent_this_month: "250.00",
        top_categories: [],
        recent_transactions: [realRow],
        last_7_days_spend: [],
      };
      mockApi["/api/v1/transactions/month-summary"] = {
        ...EMPTY_SUMMARY,
        debit_total: "250.00",
        transaction_count: 3,
      };
      mockApi["/api/v1/transactions"] = {
        items: [realRow],
        has_more: false,
        day_summaries: {},
      };
      await mount();

      act(() => {
        startTourPreview("user-a", ALL_DOMAINS);
      });
      await flush();

      const s = screens();
      expect(useTourPreviewStore.getState().accountEmpty).toBe(false);
      expect(s.home.data?.recent_transactions).toEqual([realRow]);
      expect(s.summary.data?.transaction_count).toBe(3);
      expect(s.monthList.data?.pages[0].items).toEqual([realRow]);
      // Last month and everything else stays real too: no fake budget beside real spending.
      expect(s.lastMonthSummary.data?.debit_total).toBe("250.00");
      expect(s.lastMonthInsights.data?.summary.transaction_count).toBe(0);
      expect(s.budget.data?.budget).toBeNull();
      expect(s.categoryBudgets.data).toEqual([]);
      expect(s.subscriptions.data?.items).toEqual([]);
      expect(s.income.data?.items).toEqual([]);
      expect(useTourPreviewStore.getState().shown).toBe(0);
      expect(cacheDump(client)).not.toContain(TOUR_SAMPLE_ID_PREFIX);
    });

    it("an empty account with a real budget keeps the real budget and still gets sample spending", async () => {
      mockApi["/api/v1/budget"] = {
        budget: { id: "real-budget", monthly_budget: "5000.00" },
      };
      await mount();
      act(() => {
        startTourPreview("user-a", ALL_DOMAINS);
      });
      await flush();
      expect(screens().budget.data?.budget?.monthly_budget).toBe("5000.00");
      expect(screens().home.data?.recent_transactions).toHaveLength(5);
    });

    it("does not sample recurring income while the subscriptions are real", async () => {
      mockApi["/api/v1/recurring"] = {
        items: [{ id: "real-item", kind: "subscription", name: "Gym" }],
        summary: { monthly_income_total: "0", monthly_subscriptions_total: "500.00" },
      };
      await mount();
      act(() => {
        startTourPreview("user-a", ALL_DOMAINS);
      });
      await flush();
      // Both kinds read the same mocked list here, so neither is empty and neither is sampled.
      expect(screens().income.data?.items.map((item) => item.name)).toEqual(["Gym"]);
      expect(screens().subscriptions.data?.items.map((item) => item.name)).toEqual(["Gym"]);
    });

    it("never samples a screen that failed to load or is still loading", async () => {
      mockApi = emptyAccount();
      delete mockApi["/api/v1/budget"];
      await mount();
      act(() => {
        startTourPreview("user-a", ALL_DOMAINS);
      });
      await flush();
      expect(screens().budget.data).toBeUndefined();
      expect(screens().budget.isError).toBe(true);
    });
  });

  describe("sample rows are read-only", () => {
    function DetailProbe({ row }: { row: TransactionRow }) {
      latestDetail = useTransactionDetailQuery(row);
      return null;
    }
    let latestDetail: ReturnType<typeof useTransactionDetailQuery> | undefined;

    const sampleRow = {
      id: `${TOUR_SAMPLE_ID_PREFIX}0000-4000-8000-000000000100`,
      merchant: "Chai",
    } as TransactionRow;

    it("opening a sample transaction never fetches it, never seeds the cache, and never puts its id in a key", async () => {
      await mount();
      await act(async () => {
        renderer.unmount();
        renderer = create(
          createElement(QueryClientProvider, { client }, createElement(DetailProbe, { row: sampleRow })),
        );
      });
      await flush();
      expect(mockGet).not.toHaveBeenCalledWith(expect.stringContaining(sampleRow.id));
      expect(latestDetail?.data).toBeUndefined();
      expect(cacheDump(client)).not.toContain(TOUR_SAMPLE_ID_PREFIX);
      expect(client.getQueryData(transactionsQueryKeys.detail("user-a", sampleRow.id))).toBeUndefined();
    });

    it("a real transaction still seeds the cache with the row it was opened with", async () => {
      await mount();
      const realRow = { id: "real-row-1", merchant: "Chai" } as TransactionRow;
      mockApi["/api/v1/transactions/real-row-1"] = realRow;
      await act(async () => {
        renderer.unmount();
        renderer = create(
          createElement(QueryClientProvider, { client }, createElement(DetailProbe, { row: realRow })),
        );
      });
      await flush();
      expect(latestDetail?.data).toEqual(realRow);
    });
  });
});
