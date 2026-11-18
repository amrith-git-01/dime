import { useMemo } from "react";

import { pendingInMonth, type PendingTransactionRow } from "../utils/pendingMerge";
import { usePendingTransactions } from "./usePendingTransactions";

/** The waiting manual entries that fall in the given month: the one overlay every month surface lays over the server's numbers. */
export function usePendingInMonth(year: number, monthIndex0: number): PendingTransactionRow[] {
  const { pendingRows } = usePendingTransactions();
  return useMemo(() => pendingInMonth(pendingRows, year, monthIndex0), [pendingRows, year, monthIndex0]);
}
