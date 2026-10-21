import type { InfiniteData } from "@tanstack/react-query";

import type { TransactionListFilters } from "@/features/transactions/api/transactionsApi";
import type {
  TransactionListPage,
  TransactionRow,
} from "@/features/transactions/types";

import type { TourSampleSet } from "./buildSampleMonth";

/** The same narrowing the server does for `payee` ("contains", case-insensitive) and `category_id`. */
export function sampleRowMatchesFilters(
  row: TransactionRow,
  filters: TransactionListFilters | undefined,
): boolean {
  if (filters?.categoryId && row.category_id !== filters.categoryId) {
    return false;
  }
  const payee = filters?.payee?.trim().toLowerCase();
  if (payee) {
    const name = (row.counterparty_name ?? row.merchant ?? "").toLowerCase();
    const normalized = (row.counterparty_normalized ?? "").toLowerCase();
    if (!name.includes(payee) && !normalized.includes(payee)) {
      return false;
    }
  }
  return true;
}

/** A month's sample pages narrowed by a list's filters (a payee's or a category's transactions). */
export function filterSamplePages(
  pages: InfiniteData<TransactionListPage, number>,
  filters: TransactionListFilters | undefined,
): InfiniteData<TransactionListPage, number> {
  if (!filters?.categoryId && !filters?.payee) {
    return pages;
  }
  return {
    pageParams: pages.pageParams,
    pages: pages.pages.map((page) => ({
      items: page.items.filter((row) => sampleRowMatchesFilters(row, filters)),
      has_more: false,
    })),
  };
}

/**
 * Sample rows whose time falls in the half-open range [fromIso, toIso) (a day's list, a payee
 * over a range), as one page. `past` is true when any row comes from last month.
 */
export function sampleRowsInRange(
  set: TourSampleSet,
  fromIso: string,
  toIso: string,
  filters: TransactionListFilters | undefined,
): { data: InfiniteData<TransactionListPage, number>; past: boolean } {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  const inRange = (row: TransactionRow) => {
    const at = new Date(row.transaction_at).getTime();
    return (
      Number.isFinite(from) &&
      Number.isFinite(to) &&
      at >= from &&
      at < to &&
      sampleRowMatchesFilters(row, filters)
    );
  };
  const current = set.current.monthPages.pages[0].items.filter(inRange);
  const previous = set.previous.monthPages.pages[0].items.filter(inRange);
  const items = [...current, ...previous].sort((a, b) =>
    a.transaction_at < b.transaction_at ? 1 : -1,
  );
  return {
    data: {
      pageParams: [0],
      pages: [{ items, has_more: false }],
    },
    past: previous.length > 0,
  };
}
