import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { parseISO } from "date-fns";

import { isOptimisticTransactionId } from "@/features/transactions/optimistic/optimisticTransactionId";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import type {
  HomeOverview,
  TransactionListPage,
  TransactionRow,
} from "@/features/transactions/types";
import { reconcileDaySummaries } from "@/features/transactions/utils/daySummaries";
import { monthRangeIso } from "@/utils/dates";

export function transactionInCalendarMonth(
  row: TransactionRow,
  year: number,
  calendarMonth: number,
): boolean {
  const { from, to } = monthRangeIso(year, calendarMonth - 1);
  const txAt = parseISO(row.transaction_at).getTime();
  return txAt >= parseISO(from).getTime() && txAt < parseISO(to).getTime();
}

function compareTransactionsNewestFirst(
  a: TransactionRow,
  b: TransactionRow,
): number {
  return (
    parseISO(b.transaction_at).getTime() - parseISO(a.transaction_at).getTime()
  );
}

export function stripOptimisticTransactions(
  items: TransactionRow[],
): TransactionRow[] {
  return items.filter((tx) => !isOptimisticTransactionId(tx.id));
}

function prependToMonthPages(
  prev: InfiniteData<TransactionListPage>,
  row: TransactionRow,
  options: { dropOptimistic: boolean },
): InfiniteData<TransactionListPage> {
  const filterItem = (item: TransactionRow) => {
    if (item.id === row.id) {
      return false;
    }
    if (options.dropOptimistic && isOptimisticTransactionId(item.id)) {
      return false;
    }
    return true;
  };

  if (prev.pages.length === 0) {
    return {
      ...prev,
      pages: [{ items: [row], has_more: false }],
      pageParams: prev.pageParams.length > 0 ? prev.pageParams : [0],
    };
  }

  const pages = prev.pages.map((page, index) => {
    const items = page.items.filter(filterItem);
    if (index !== 0) {
      return { ...page, items };
    }
    return { ...page, items: [row, ...items] };
  });

  return { ...prev, pages };
}

function replaceInMonthPages(
  prev: InfiniteData<TransactionListPage>,
  row: TransactionRow,
): InfiniteData<TransactionListPage> {
  let found = false;
  const pages = prev.pages.map((page) => {
    const items = page.items.map((item) => {
      if (item.id !== row.id) {
        return item;
      }
      found = true;
      return row;
    });
    return { ...page, items };
  });

  if (found) {
    return { ...prev, pages };
  }

  return prependToMonthPages(prev, row, { dropOptimistic: false });
}

export function removeFromMonthPages(
  prev: InfiniteData<TransactionListPage>,
  transactionId: string,
): InfiniteData<TransactionListPage> {
  const pages = prev.pages.map((page) => ({
    ...page,
    items: page.items.filter((item) => item.id !== transactionId),
  }));
  return { ...prev, pages };
}

export function upsertHomeRecentTransactions(
  prev: HomeOverview,
  row: TransactionRow,
  options: { dropOptimistic: boolean },
): HomeOverview {
  const filtered = prev.recent_transactions.filter((tx) => {
    if (tx.id === row.id) {
      return false;
    }
    if (options.dropOptimistic && isOptimisticTransactionId(tx.id)) {
      return false;
    }
    return true;
  });
  const recent_transactions = [row, ...filtered]
    .sort(compareTransactionsNewestFirst)
    .slice(0, 5);
  return { ...prev, recent_transactions };
}

export function removeFromHomeRecentTransactions(
  prev: HomeOverview,
  transactionId: string,
): HomeOverview {
  return {
    ...prev,
    recent_transactions: prev.recent_transactions.filter(
      (tx) => tx.id !== transactionId,
    ),
  };
}

function forEachMonthPageQuery(
  queryClient: QueryClient,
  userId: string,
  visit: (
    queryKey: readonly unknown[],
    data: InfiniteData<TransactionListPage>,
  ) => void,
): void {
  const monthQueries = queryClient.getQueryCache().findAll({
    queryKey: transactionsQueryKeys.all,
    predicate: (query) => {
      const key = query.queryKey;
      return (
        key.length >= 6 &&
        key[0] === transactionsQueryKeys.all[0] &&
        key[1] === "monthPages" &&
        key[2] === userId
      );
    },
  });

  for (const query of monthQueries) {
    const data = query.state.data as
      | InfiniteData<TransactionListPage>
      | undefined;
    if (!data) {
      continue;
    }
    visit(query.queryKey, data);
  }
}

/** Looks a row up in the cached home overview and month pages (used to keep signed media URLs). */
export function findTransactionInListCaches(
  queryClient: QueryClient,
  input: { userId: string; timezone: string; transactionId: string },
): TransactionRow | null {
  const { userId, timezone, transactionId } = input;

  const home = queryClient.getQueryData<HomeOverview>(
    transactionsQueryKeys.home(userId, timezone),
  );
  const fromHome = home?.recent_transactions.find(
    (tx) => tx.id === transactionId,
  );
  if (fromHome) {
    return fromHome;
  }

  let found: TransactionRow | null = null;
  forEachMonthPageQuery(queryClient, userId, (_queryKey, data) => {
    if (found) {
      return;
    }
    for (const page of data.pages) {
      const match = page.items.find((item) => item.id === transactionId);
      if (match) {
        found = match;
        return;
      }
    }
  });
  return found;
}

export function applyTransactionInsertToListCaches(
  queryClient: QueryClient,
  input: { userId: string; timezone: string; row: TransactionRow },
): void {
  const { userId, timezone, row } = input;

  const homeKey = transactionsQueryKeys.home(userId, timezone);
  const prevHome = queryClient.getQueryData<HomeOverview>(homeKey);
  if (prevHome) {
    queryClient.setQueryData(
      homeKey,
      upsertHomeRecentTransactions(prevHome, row, { dropOptimistic: true }),
    );
  }

  forEachMonthPageQuery(queryClient, userId, (queryKey, prevMonth) => {
    const year = queryKey[3];
    const calendarMonth = queryKey[4];
    if (typeof year !== "number" || typeof calendarMonth !== "number") {
      return;
    }
    if (!transactionInCalendarMonth(row, year, calendarMonth)) {
      return;
    }
    const isNew = !prevMonth.pages.some((page) =>
      page.items.some((item) => item.id === row.id),
    );
    queryClient.setQueryData(
      queryKey,
      reconcileDaySummaries(
        prevMonth,
        prependToMonthPages(prevMonth, row, { dropOptimistic: true }),
      ),
    );
    // A new row shifts every later page by one, so a month with older pages still to load would
    // repeat a row at the next page boundary: refetch it (the patch above covers the wait).
    if (isNew && prevMonth.pages[prevMonth.pages.length - 1]?.has_more) {
      void queryClient.invalidateQueries({ queryKey, exact: true });
    }
  });
}

export function applyTransactionUpdateToListCaches(
  queryClient: QueryClient,
  input: { userId: string; timezone: string; row: TransactionRow },
): void {
  const { userId, timezone, row } = input;

  const homeKey = transactionsQueryKeys.home(userId, timezone);
  const prevHome = queryClient.getQueryData<HomeOverview>(homeKey);
  if (prevHome) {
    const inRecent = prevHome.recent_transactions.some(
      (tx) => tx.id === row.id,
    );
    if (inRecent) {
      const recent_transactions = prevHome.recent_transactions
        .map((tx) => (tx.id === row.id ? row : tx))
        .sort(compareTransactionsNewestFirst)
        .slice(0, 5);
      queryClient.setQueryData(homeKey, { ...prevHome, recent_transactions });
    }
  }

  forEachMonthPageQuery(queryClient, userId, (queryKey, prevMonth) => {
    const year = queryKey[3];
    const calendarMonth = queryKey[4];
    if (typeof year !== "number" || typeof calendarMonth !== "number") {
      return;
    }
    const inMonth = transactionInCalendarMonth(row, year, calendarMonth);
    const hadRow = prevMonth.pages.some((page) =>
      page.items.some((item) => item.id === row.id),
    );

    if (!inMonth) {
      if (hadRow) {
        queryClient.setQueryData(
          queryKey,
          reconcileDaySummaries(
            prevMonth,
            removeFromMonthPages(prevMonth, row.id),
          ),
        );
      }
      return;
    }

    // Not loaded but older pages remain: the row may already be counted in the server's day
    // totals, so treating it as new would double-count. Refetch instead (as the remove path does).
    if (!hadRow && prevMonth.pages[prevMonth.pages.length - 1]?.has_more) {
      void queryClient.invalidateQueries({ queryKey, exact: true });
      return;
    }

    queryClient.setQueryData(
      queryKey,
      reconcileDaySummaries(prevMonth, replaceInMonthPages(prevMonth, row)),
    );
  });
}

export function applyTransactionRemoveFromListCaches(
  queryClient: QueryClient,
  input: { userId: string; timezone: string; transactionId: string },
): void {
  const { userId, timezone, transactionId } = input;

  const homeKey = transactionsQueryKeys.home(userId, timezone);
  const prevHome = queryClient.getQueryData<HomeOverview>(homeKey);
  if (prevHome) {
    queryClient.setQueryData(
      homeKey,
      removeFromHomeRecentTransactions(prevHome, transactionId),
    );
  }

  forEachMonthPageQuery(queryClient, userId, (queryKey, prevMonth) => {
    const loaded = prevMonth.pages.some((page) =>
      page.items.some((item) => item.id === transactionId),
    );
    if (!loaded) {
      // Not in the loaded pages, but it may sit in an older page that is not fetched yet and
      // still counted in the day totals: refetch rather than leave a stale count.
      if (prevMonth.pages[prevMonth.pages.length - 1]?.has_more) {
        void queryClient.invalidateQueries({ queryKey, exact: true });
      }
      return;
    }
    queryClient.setQueryData(
      queryKey,
      reconcileDaySummaries(
        prevMonth,
        removeFromMonthPages(prevMonth, transactionId),
      ),
    );
  });
}
