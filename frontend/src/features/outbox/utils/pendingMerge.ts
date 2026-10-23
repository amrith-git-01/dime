import { parseISO } from "date-fns";

import { transactionInCalendarMonth } from "@/features/transactions/cache/transactionListCache";
import type {
  DayTransactionSummary,
  TransactionRow,
} from "@/features/transactions/types";
import { transactionCalendarDayKey } from "@/features/transactions/utils/buildTransactionFlashListData";
import type { OutboxItem } from "@/lib/outbox/outboxTypes";
import { toPaise } from "@/utils/paise";

/**
 * A manual entry still waiting in the outbox, shaped like a server row so list rows can draw it.
 * UI only: these are merged in at view-model level and never written into the query cache.
 */
export type PendingTransactionRow = TransactionRow & {
  pending: true;
  /** The outbox item behind it (same as `id`). */
  outboxId: string;
};

export function isPendingTransactionRow(
  tx: TransactionRow,
): tx is PendingTransactionRow {
  return (tx as Partial<PendingTransactionRow>).pending === true;
}

/** Integer paise as a signed decimal string (`-0.50`, `1250.00`); `paiseToAmountString` drops the sign below one rupee. */
function paiseToSignedAmount(paise: number): string {
  const abs = Math.abs(paise);
  return `${paise < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function pendingRowFromItem(
  item: OutboxItem,
  userId: string,
): PendingTransactionRow | null {
  if (item.kind !== "manual" || !item.preview) {
    return null;
  }
  const { preview } = item;
  const createdAt = new Date(item.createdAt).toISOString();
  return {
    id: item.id,
    user_id: userId,
    amount: preview.amount,
    type: preview.type,
    counterparty_name: preview.counterparty_name,
    counterparty_type: preview.counterparty_type,
    counterparty_normalized: null,
    merchant: preview.counterparty_name,
    category: preview.category,
    category_id: preview.category_id,
    category_icon_name: preview.category_icon_name,
    category_color: preview.category_color,
    recurring_item_id: null,
    brand_id: item.body?.brand_id ?? null,
    note: preview.note,
    detected_via: "manual",
    transaction_at: preview.transaction_at,
    created_at: createdAt,
    updated_at: createdAt,
    deleted_at: null,
    receipt_url: null,
    voice_url: null,
    pending: true,
    outboxId: item.id,
  };
}

/** Pending manual entries of the user, in outbox order. */
export function pendingRowsFromItems(
  items: readonly OutboxItem[],
  userId: string | null | undefined,
): PendingTransactionRow[] {
  if (!userId) {
    return [];
  }
  const rows: PendingTransactionRow[] = [];
  for (const item of items) {
    const row = pendingRowFromItem(item, userId);
    if (row) {
      rows.push(row);
    }
  }
  return rows;
}

function newestFirst(a: TransactionRow, b: TransactionRow): number {
  return parseISO(b.transaction_at).getTime() - parseISO(a.transaction_at).getTime();
}

/** Home "Recent": the server's rows plus the waiting ones, newest first, cut to `limit`. */
export function mergePendingRecent(
  serverRows: readonly TransactionRow[],
  pending: readonly PendingTransactionRow[],
  limit: number,
): TransactionRow[] {
  if (pending.length === 0) {
    return serverRows.slice(0, limit);
  }
  return [...pending, ...serverRows].sort(newestFirst).slice(0, limit);
}

export function pendingInMonth(
  pending: readonly PendingTransactionRow[],
  year: number,
  monthIndex0: number,
): PendingTransactionRow[] {
  return pending.filter((row) => transactionInCalendarMonth(row, year, monthIndex0 + 1));
}

export function pendingOnDay(
  pending: readonly PendingTransactionRow[],
  dayKey: string,
): PendingTransactionRow[] {
  return pending.filter((row) => transactionCalendarDayKey(row.transaction_at) === dayKey);
}

export type PendingTotals = {
  debitPaise: number;
  creditPaise: number;
  count: number;
};

export function pendingTotals(pending: readonly PendingTransactionRow[]): PendingTotals {
  let debitPaise = 0;
  let creditPaise = 0;
  for (const row of pending) {
    if (row.type === "credit") {
      creditPaise += toPaise(row.amount);
    } else {
      debitPaise += toPaise(row.amount);
    }
  }
  return { debitPaise, creditPaise, count: pending.length };
}

/** `"1200.00"` + paise -> `"1250.50"`; the API's decimal strings stay exact. */
export function addPaiseToAmount(amount: string | undefined, paise: number): string {
  return paiseToSignedAmount(toPaise(amount) + paise);
}

/** Month stats (home hero, month summary): the server's totals plus what is waiting. */
export function addPendingToMonthTotals(
  totals: { debit_total: string; credit_total: string; net: string; transaction_count: number },
  pending: PendingTotals,
): { debit_total: string; credit_total: string; net: string; transaction_count: number } {
  if (pending.count === 0) {
    return totals;
  }
  return {
    debit_total: addPaiseToAmount(totals.debit_total, pending.debitPaise),
    credit_total: addPaiseToAmount(totals.credit_total, pending.creditPaise),
    net: addPaiseToAmount(totals.net, pending.creditPaise - pending.debitPaise),
    transaction_count: totals.transaction_count + pending.count,
  };
}

/** Per-day totals with the waiting entries added to their days (a new day is created when needed). */
export function addPendingToDaySummaries(
  summaries: Record<string, DayTransactionSummary>,
  pending: readonly PendingTransactionRow[],
): Record<string, DayTransactionSummary> {
  if (pending.length === 0) {
    return summaries;
  }
  const next = { ...summaries };
  for (const row of pending) {
    const date = transactionCalendarDayKey(row.transaction_at);
    const current = next[date];
    const cents = toPaise(row.amount);
    const credit = toPaise(current?.credit_total) + (row.type === "credit" ? cents : 0);
    const debit = toPaise(current?.debit_total) + (row.type === "debit" ? cents : 0);
    next[date] = {
      ...current,
      date,
      credit_total: paiseToSignedAmount(credit),
      debit_total: paiseToSignedAmount(debit),
      net: paiseToSignedAmount(credit - debit),
      transaction_count: (current?.transaction_count ?? 0) + 1,
    };
  }
  return next;
}
