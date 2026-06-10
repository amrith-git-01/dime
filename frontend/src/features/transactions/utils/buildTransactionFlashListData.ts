import { format, isToday, isYesterday, parseISO } from "date-fns";

import type { TransactionRow } from "@/features/transactions/types";

export function transactionCalendarDayKey(transactionAtIso: string): string {
  return format(parseISO(transactionAtIso), "yyyy-MM-dd");
}

/** Notifications-style section for {@link TransactionsListScreen}. */
export type TransactionListSection = {
  key: string;
  title: string;
  data: TransactionRow[];
};

type RelativeDayKey = "today" | "yesterday" | "earlier";

const RELATIVE_DAY_TITLES: Record<RelativeDayKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

function relativeDayBucket(dayKey: string): RelativeDayKey {
  const date = parseISO(`${dayKey}T12:00:00`);
  if (isToday(date)) {
    return "today";
  }
  if (isYesterday(date)) {
    return "yesterday";
  }
  return "earlier";
}

/** Section title for a calendar day (Today / Yesterday / formatted date). */
export function transactionListDaySectionTitle(dayKey: string): string {
  const bucket = relativeDayBucket(dayKey);
  if (bucket === "today" || bucket === "yesterday") {
    return RELATIVE_DAY_TITLES[bucket];
  }
  return format(parseISO(`${dayKey}T12:00:00`), "d MMMM yyyy");
}

/** One section per calendar day (newest first); titles use Today / Yesterday / date. */
export function groupTransactionsByCalendarDay(
  transactions: TransactionRow[],
): TransactionListSection[] {
  const dayOrder: string[] = [];
  const grouped = new Map<string, TransactionRow[]>();

  const sorted = [...transactions].sort(
    (a, b) =>
      parseISO(b.transaction_at).getTime() -
      parseISO(a.transaction_at).getTime(),
  );

  for (const transaction of sorted) {
    const dayKey = transactionCalendarDayKey(transaction.transaction_at);
    if (!grouped.has(dayKey)) {
      dayOrder.push(dayKey);
      grouped.set(dayKey, []);
    }
    grouped.get(dayKey)?.push(transaction);
  }

  return dayOrder.map((dayKey) => ({
    key: dayKey,
    title: transactionListDaySectionTitle(dayKey),
    data: grouped.get(dayKey) ?? [],
  }));
}

export type TransactionListFilter = "day" | "payee" | "category";

export function buildTransactionListSections(
  transactions: TransactionRow[],
  filter: TransactionListFilter,
  dayKey?: string,
): TransactionListSection[] {
  if (filter === "day" && dayKey) {
    return [
      {
        key: dayKey,
        title: transactionListDaySectionTitle(dayKey),
        data: transactions,
      },
    ];
  }
  return groupTransactionsByCalendarDay(transactions);
}

export type TransactionFlashListItem = {
  kind: "row";
  id: string;
  transaction: TransactionRow;
  sectionRowIndex: number;
};

export function filterTransactionsByCalendarDay(
  transactions: TransactionRow[],
  dayKey: string,
): TransactionRow[] {
  return transactions.filter(
    (transaction) =>
      transactionCalendarDayKey(transaction.transaction_at) === dayKey,
  );
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
