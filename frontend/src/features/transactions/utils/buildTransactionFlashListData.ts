import { format, isToday, isYesterday, parseISO, subDays } from "date-fns";

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

/** Notifications-style section for {@link TransactionsListScreen}. */
export type TransactionListSection = {
  key: string;
  title: string;
  data: TransactionRow[];
};

const RELATIVE_DAY_ORDER = ["today", "yesterday", "earlier"] as const;
type RelativeDayKey = (typeof RELATIVE_DAY_ORDER)[number];

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

/** Today → Yesterday → Earlier buckets (matches notifications inbox). */
export function groupTransactionsByRelativeDay(
  transactions: TransactionRow[],
): TransactionListSection[] {
  const buckets = new Map<RelativeDayKey, TransactionRow[]>();

  const sorted = [...transactions].sort(
    (a, b) =>
      parseISO(b.transaction_at).getTime() -
      parseISO(a.transaction_at).getTime(),
  );

  for (const transaction of sorted) {
    const bucket = relativeDayBucket(
      transactionCalendarDayKey(transaction.transaction_at),
    );
    const list = buckets.get(bucket) ?? [];
    list.push(transaction);
    buckets.set(bucket, list);
  }

  return RELATIVE_DAY_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    title: RELATIVE_DAY_TITLES[key],
    data: buckets.get(key) ?? [],
  }));
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

/** Section label for grouped transaction lists (Insights drill-down, etc.). */
export function transactionDaySectionTitle(dayKey: string): string {
  return sectionDateHeading(dayKey);
}

/** Stack header title for a single-day transaction list. */
export function transactionDayScreenTitle(dayKey: string): string {
  const todayKey = format(new Date(), "yyyy-MM-dd");
  if (dayKey === todayKey) {
    return "Today";
  }
  return format(parseISO(`${dayKey}T12:00:00`), "d MMM yyyy");
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
