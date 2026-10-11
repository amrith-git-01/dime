import {
  dehydrate,
  QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";

import { insightsQueryKeys } from "@/features/analytics/queryKeys";
import { budgetQueryKeys } from "@/features/budgets/queryKeys";
import { categoriesQueryKeys } from "@/features/categories/queryKeys";
import { limitsQueryKeys } from "@/features/limits/queryKeys";
import { notificationQueryKeys } from "@/features/notifications/queryKeys";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";

import {
  PERSISTED_CACHE_MAX_CHARS,
  serializePersistedClient,
  shouldDehydrateQuery,
} from "../queryCachePolicy";

jest.mock("@/lib/reportError", () => ({ reportError: jest.fn() }));

const USER = "user-a";
const TZ = "Asia/Kolkata";
// October 2026: current month = 10, previous month = 9.
const NOW = new Date(2026, 9, 15);

function row(id: string) {
  return {
    id,
    receipt_url: `https://signed.example/${id}/receipt?token=secret`,
    voice_url: `https://signed.example/${id}/voice?token=secret`,
    merchant: "Cafe",
  };
}

function page(ids: string[]) {
  return { items: ids.map(row), has_more: true };
}

function dehydrateAll(queryClient: QueryClient): PersistedClient {
  return {
    timestamp: NOW.getTime(),
    buster: "test",
    clientState: dehydrate(queryClient, {
      shouldDehydrateQuery: (query) => shouldDehydrateQuery(query, NOW),
    }),
  };
}

function persistedKeys(client: PersistedClient): QueryKey[] {
  return client.clientState.queries.map((query) => query.queryKey);
}

describe("shouldDehydrateQuery", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  afterEach(() => queryClient.clear());

  function persisted(keys: QueryKey[]): QueryKey[] {
    keys.forEach((key) => queryClient.setQueryData(key, { value: 1 }));
    return persistedKeys(dehydrateAll(queryClient));
  }

  it("excludes range pages, filtered month pages, detail rows and notifications", () => {
    const excluded = [
      transactionsQueryKeys.rangePages(USER, "2026-01-01", "2026-02-01"),
      transactionsQueryKeys.filteredMonthPages(USER, 2026, 10, TZ, {
        payee: "cafe",
      }),
      transactionsQueryKeys.detail(USER, "tx-1"),
      notificationQueryKeys.inboxList(USER),
      notificationQueryKeys.unreadCount(USER),
    ];
    expect(persisted(excluded)).toEqual([]);
  });

  it("never persists today's limits", () => {
    expect(persisted([limitsQueryKeys.current(USER)])).toEqual([]);
  });

  it("keeps the current and previous month of monthPages, monthSummary and insights", () => {
    const kept = [
      transactionsQueryKeys.monthPages(USER, 2026, 10, TZ),
      transactionsQueryKeys.monthPages(USER, 2026, 9, TZ),
      transactionsQueryKeys.monthSummary(USER, 2026, 10, TZ),
      insightsQueryKeys.month(USER, 2026, 9, TZ),
    ];
    expect(persisted(kept)).toEqual(kept);
  });

  it("drops older months", () => {
    const dropped = [
      transactionsQueryKeys.monthPages(USER, 2026, 8, TZ),
      transactionsQueryKeys.monthSummary(USER, 2025, 10, TZ),
      insightsQueryKeys.month(USER, 2026, 1, TZ),
      transactionsQueryKeys.monthPages(USER, 2026, 11, TZ),
    ];
    expect(persisted(dropped)).toEqual([]);
  });

  it("treats December as the previous month in January", () => {
    const january = new Date(2027, 0, 5);
    const keys = [
      insightsQueryKeys.month(USER, 2026, 12, TZ),
      insightsQueryKeys.month(USER, 2026, 11, TZ),
    ];
    keys.forEach((key) => queryClient.setQueryData(key, 1));
    const kept = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => shouldDehydrateQuery(query, january))
      .map((query) => query.queryKey);
    expect(kept).toEqual([keys[0]]);
  });

  it("keeps non-month data and skips queries that are not successful", () => {
    const kept = [
      categoriesQueryKeys.list(USER),
      budgetQueryKeys.current(USER),
      transactionsQueryKeys.home(USER, TZ),
    ];
    expect(persisted(kept)).toEqual(kept);

    const failing = ["categories", "failing"] as const;
    void queryClient
      .fetchQuery({
        queryKey: failing,
        queryFn: () => Promise.reject(new Error("nope")),
        retry: false,
      })
      .catch(() => undefined);
    const query = queryClient.getQueryCache().find({ queryKey: failing });
    expect(query).toBeDefined();
    expect(shouldDehydrateQuery(query!, NOW)).toBe(false);
  });
});

describe("serializePersistedClient", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  afterEach(() => queryClient.clear());

  function roundTrip() {
    return JSON.parse(
      serializePersistedClient(dehydrateAll(queryClient)),
    ) as PersistedClient;
  }

  it("persists only the first page of infinite queries", () => {
    queryClient.setQueryData(transactionsQueryKeys.monthPages(USER, 2026, 10, TZ), {
      pages: [page(["a", "b"]), page(["c"]), page(["d"])],
      pageParams: [0, 50, 100],
    });

    const [query] = roundTrip().clientState.queries;
    const data = query.state.data as { pages: { items: { id: string }[] }[]; pageParams: number[] };
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0].items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(data.pageParams).toEqual([0]);
  });

  it("strips signed media URLs from list and home rows", () => {
    queryClient.setQueryData(transactionsQueryKeys.monthPages(USER, 2026, 10, TZ), {
      pages: [page(["a"])],
      pageParams: [0],
    });
    queryClient.setQueryData(transactionsQueryKeys.home(USER, TZ), {
      spent_today: "0",
      recent_transactions: [row("h1")],
    });

    const serialized = serializePersistedClient(dehydrateAll(queryClient));
    expect(serialized).not.toContain("signed.example");
    expect(serialized).not.toContain("token=secret");

    const queries = (JSON.parse(serialized) as PersistedClient).clientState.queries;
    const home = queries.find((query) => query.queryKey[1] === "home");
    expect(
      (home?.state.data as { recent_transactions: { receipt_url: null; merchant: string }[] })
        .recent_transactions[0],
    ).toMatchObject({ receipt_url: null, voice_url: null, merchant: "Cafe" });
  });

  it("never mutates the live cache", () => {
    const key = transactionsQueryKeys.monthPages(USER, 2026, 10, TZ);
    queryClient.setQueryData(key, {
      pages: [page(["a"]), page(["b"])],
      pageParams: [0, 50],
    });
    roundTrip();

    const live = queryClient.getQueryData<{
      pages: { items: { receipt_url: string | null }[] }[];
    }>(key);
    expect(live?.pages).toHaveLength(2);
    expect(live?.pages[0].items[0].receipt_url).toContain("signed.example");
  });

  it("evicts paged month lists, keeping the small queries, above the size budget", () => {
    const huge = "x".repeat(PERSISTED_CACHE_MAX_CHARS);
    queryClient.setQueryData(transactionsQueryKeys.monthPages(USER, 2026, 10, TZ), {
      pages: [{ items: [{ id: "a", merchant: huge }], has_more: false }],
      pageParams: [0],
    });
    queryClient.setQueryData(categoriesQueryKeys.list(USER), [{ id: "c1" }]);
    queryClient.setQueryData(transactionsQueryKeys.home(USER, TZ), { spent_today: "1" });

    const serialized = serializePersistedClient(dehydrateAll(queryClient));
    expect(serialized.length).toBeLessThan(PERSISTED_CACHE_MAX_CHARS);
    const keys = persistedKeys(JSON.parse(serialized) as PersistedClient);
    expect(keys).toEqual([
      categoriesQueryKeys.list(USER),
      transactionsQueryKeys.home(USER, TZ),
    ]);
  });

  it("leaves a cache under the budget untouched", () => {
    queryClient.setQueryData(categoriesQueryKeys.list(USER), [{ id: "c1" }]);
    queryClient.setQueryData(transactionsQueryKeys.monthPages(USER, 2026, 10, TZ), {
      pages: [page(["a"])],
      pageParams: [0],
    });
    expect(persistedKeys(roundTrip())).toHaveLength(2);
  });
});
