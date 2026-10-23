import { format, isToday, isYesterday, parseISO } from "date-fns";

import type { RecurringOccurrence } from "@/features/recurring/types";
import type { TransactionRow } from "@/features/transactions/types";

import { todayDayKey } from "./transactionsCalendar";

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

export type TransactionFlashListRowItem = {
  kind: "row";
  id: string;
  transaction: TransactionRow;
  sectionRowIndex: number;
};

/** A recurring occurrence due on the day that is not a real transaction yet (a ghost row, never counted). */
export type TransactionFlashListUpcomingItem = {
  kind: "upcoming";
  id: string;
  occurrence: RecurringOccurrence;
  sectionRowIndex: number;
};

export type TransactionFlashListItem =
  | TransactionFlashListRowItem
  | TransactionFlashListUpcomingItem;

/**
 * Upcoming recurring occurrences grouped by their due day, for TODAY and later only: a past day with an
 * unposted occurrence is not shown as upcoming. Only `upcoming` status counts (paid ones are real rows).
 */
export function groupUpcomingByDay(
  occurrences: readonly RecurringOccurrence[] | undefined,
  now: Date = new Date(),
): Record<string, RecurringOccurrence[]> {
  const byDay: Record<string, RecurringOccurrence[]> = {};
  const today = todayDayKey(now);
  for (const occurrence of occurrences ?? []) {
    if (occurrence.status !== "upcoming") continue;
    if (occurrence.due_date < today) continue;
    (byDay[occurrence.due_date] ??= []).push(occurrence);
  }
  return byDay;
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

/**
 * Newest first within the day (matches API month ordering). Upcoming recurring occurrences due on
 * `dayKey` follow the real rows, only when the day is today or later.
 */
export function buildTransactionFlashListItemsForSingleDay(
  transactions: TransactionRow[],
  dayKey: string,
  upcoming: readonly RecurringOccurrence[] = [],
  now: Date = new Date(),
): TransactionFlashListItem[] {
  const forDay = filterTransactionsByCalendarDay(transactions, dayKey).sort(
    (a, b) =>
      parseISO(b.transaction_at).getTime() -
      parseISO(a.transaction_at).getTime(),
  );
  const rows: TransactionFlashListItem[] = forDay.map((transaction, sectionRowIndex) => ({
    kind: "row" as const,
    id: transaction.id,
    transaction,
    sectionRowIndex,
  }));
  if (dayKey < todayDayKey(now) || upcoming.length === 0) {
    return rows;
  }
  const ghosts = upcoming
    .filter((occurrence) => occurrence.status === "upcoming" && occurrence.due_date === dayKey)
    .map((occurrence, index) => ({
      kind: "upcoming" as const,
      id: `upcoming:${occurrence.id}:${occurrence.due_date}`,
      occurrence,
      sectionRowIndex: rows.length + index,
    }));
  return [...rows, ...ghosts];
}

export type TransactionListHeaderItem = {
  kind: "header";
  id: string;
  /** Calendar day of the section (`yyyy-MM-dd`). */
  dayKey: string;
  title: string;
  /** Net total of the section, in rupees. */
  netTotal: number;
};

export type TransactionListRowItem = {
  kind: "row";
  id: string;
  transaction: TransactionRow;
  isFirstInSection: boolean;
  isLastInSection: boolean;
};

/** One entry of the virtualized transactions list: a day header or a transaction row. */
export type TransactionListItem =
  | TransactionListHeaderItem
  | TransactionListRowItem;

/** Flattens day sections into FlashList rows with the day header as its own item. */
export function flattenTransactionListSections(
  sections: TransactionListSection[],
  netTotals: Record<string, number>,
): TransactionListItem[] {
  const items: TransactionListItem[] = [];

  sections.forEach((section) => {
    items.push({
      kind: "header",
      id: `header:${section.key}`,
      dayKey: section.key,
      title: section.title,
      netTotal: netTotals[section.key] ?? 0,
    });
    section.data.forEach((transaction, rowIndex) => {
      items.push({
        kind: "row",
        id: transaction.id,
        transaction,
        isFirstInSection: rowIndex === 0,
        isLastInSection: rowIndex === section.data.length - 1,
      });
    });
  });

  return items;
}
