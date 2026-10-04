import { useEffect } from "react";

import type { TransactionRow } from "@/features/transactions/types";
import { transactionCalendarDayKey } from "@/features/transactions/utils/buildTransactionFlashListData";

type UsePrefetchTransactionsForSelectedDayArgs = {
  selectedDayKey: string;
  flatRows: TransactionRow[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
};

/**
 * Month list loads newest-first pages. When user picks an earlier calendar day,
 * fetch older pages until the loaded window passes that day or pagination ends.
 */
export function usePrefetchTransactionsForSelectedDay({
  selectedDayKey,
  flatRows,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: UsePrefetchTransactionsForSelectedDayArgs) {
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }

    const oldestKey = flatRows.length
      ? transactionCalendarDayKey(flatRows[flatRows.length - 1].transaction_at)
      : null;

    if (oldestKey === null) {
      return;
    }

    // Keep paging until the loaded window is older than the selected day. When the selected
    // day is the oldest one loaded its rows may continue on the next page.
    if (selectedDayKey <= oldestKey) {
      void fetchNextPage();
    }
  }, [
    selectedDayKey,
    flatRows,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);
}
