import { format, parseISO, subDays } from "date-fns";

import type { TransactionRow } from "@/features/transactions/types";
import { signedAmount } from "@/features/transactions/utils/transactionDisplay";

export function transactionCalendarDayKey(transactionAtIso: string): string {
  return format(parseISO(transactionAtIso), "yyyy-MM-dd");
}

export type GroupedTransactionSection = {
  groupDateKey: string;
  date: string;
  dailyTotal: number;
  sectionIndex: number;
  data: TransactionRow[];
};

export type TransactionFlashListItem =
  | {
      kind: "header";
      id: string;
      isFirstSection: boolean;
      dateLabel: string;
      dailyTotal: number;
    }
  | {
      kind: "row";
      id: string;
      transaction: TransactionRow;
      sectionRowIndex: number;
    };

function sectionDateHeading(dateKey: string): string {
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const yesterdayKey = format(subDays(new Date(), 1), "yyyy-MM-dd");
  if (dateKey === todayKey) {
    return "TODAY";
  }
  if (dateKey === yesterdayKey) {
    return "YESTERDAY";
  }
  const d = parseISO(`${dateKey}T12:00:00`);
  return format(d, "EEE, d MMM").toUpperCase();
}

export function groupTransactionsByDay(
  transactions: TransactionRow[],
): GroupedTransactionSection[] {
  const order: string[] = [];
  const grouped = new Map<string, TransactionRow[]>();

  transactions.forEach((transaction) => {
    const parsed = parseISO(transaction.transaction_at);
    const key = format(parsed, "yyyy-MM-dd");
    if (!grouped.has(key)) {
      order.push(key);
      grouped.set(key, []);
    }
    grouped.get(key)?.push(transaction);
  });

  order.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  return order.map((dateKey, sectionIndex) => {
    const data = grouped.get(dateKey) ?? [];
    const dailyTotal = data.reduce((total, transaction) => {
      return total + signedAmount(transaction);
    }, 0);

    return {
      groupDateKey: dateKey,
      date: sectionDateHeading(dateKey),
      dailyTotal,
      sectionIndex,
      data,
    };
  });
}

export function flattenGroupedTransactionsForFlashList(
  sections: GroupedTransactionSection[],
): TransactionFlashListItem[] {
  const out: TransactionFlashListItem[] = [];
  for (const section of sections) {
    out.push({
      kind: "header",
      id: `header-${section.groupDateKey}`,
      isFirstSection: section.sectionIndex === 0,
      dateLabel: section.date,
      dailyTotal: section.dailyTotal,
    });
    section.data.forEach((transaction, sectionRowIndex) => {
      out.push({
        kind: "row",
        id: transaction.id,
        transaction,
        sectionRowIndex,
      });
    });
  }
  return out;
}

export function buildTransactionFlashListItems(
  transactions: TransactionRow[],
): TransactionFlashListItem[] {
  return flattenGroupedTransactionsForFlashList(
    groupTransactionsByDay(transactions),
  );
}

export function filterTransactionsByCalendarDay(
  transactions: TransactionRow[],
  dayKey: string,
): TransactionRow[] {
  return transactions.filter(
    (transaction) =>
      transactionCalendarDayKey(transaction.transaction_at) === dayKey,
  );
}

/** Newest first, no day headers (payee / search-style month lists). */
export function buildTransactionFlashListRowsOnly(
  transactions: TransactionRow[],
): TransactionFlashListItem[] {
  const sorted = [...transactions].sort(
    (a, b) =>
      parseISO(b.transaction_at).getTime() -
      parseISO(a.transaction_at).getTime(),
  );
  return sorted.map((transaction, sectionRowIndex) => ({
    kind: "row" as const,
    id: transaction.id,
    transaction,
    sectionRowIndex,
  }));
}

/** Newest first within the day (matches API month ordering). */
export function buildTransactionFlashListItemsForSingleDay(
  transactions: TransactionRow[],
  dayKey: string,
): TransactionFlashListItem[] {
  const forDay = filterTransactionsByCalendarDay(transactions, dayKey).sort(
    (a, b) =>
      parseISO(b.transaction_at).getTime() -
      parseISO(a.transaction_at).getTime(),
  );
  return forDay.map((transaction, sectionRowIndex) => ({
    kind: "row" as const,
    id: transaction.id,
    transaction,
    sectionRowIndex,
  }));
}
