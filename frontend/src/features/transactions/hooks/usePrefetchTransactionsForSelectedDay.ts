import { useEffect } from "react";

import type { TransactionRow } from "@/features/transactions/types";
import {
  filterTransactionsByCalendarDay,
  transactionCalendarDayKey,
} from "@/features/transactions/utils/buildTransactionFlashListData";

type UsePrefetchTransactionsForSelectedDayArgs = {
  selectedDayKey: string;
  flatRows: TransactionRow[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  disabled?: boolean;
};

/**
 * Month list loads newest-first pages. When user picks an earlier calendar day,
 * fetch older pages until loaded window reaches that day or pagination ends.
 */
export function usePrefetchTransactionsForSelectedDay({
  selectedDayKey,
  flatRows,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  disabled = false,
}: UsePrefetchTransactionsForSelectedDayArgs) {
  useEffect(() => {
    if (disabled || !hasNextPage || isFetchingNextPage) {
      return;
    }

    const forSelectedDay = filterTransactionsByCalendarDay(
      flatRows,
      selectedDayKey,
    );
    if (forSelectedDay.length > 0) {
      return;
    }

    const oldestKey = flatRows.length
      ? transactionCalendarDayKey(flatRows[flatRows.length - 1].transaction_at)
      : null;

    if (oldestKey === null) {
      return;
    }

    if (selectedDayKey < oldestKey) {
      void fetchNextPage();
    }
  }, [
    disabled,
    selectedDayKey,
    flatRows,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);
}
