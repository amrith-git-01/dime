import type { InfiniteData } from "@tanstack/react-query";

import type {
  DayTransactionSummary,
  TransactionListPage,
  TransactionRow,
} from "../types";
import { transactionCalendarDayKey } from "./buildTransactionFlashListData";

function toCents(amount: string): number {
  const value = Number.parseFloat(amount);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  const frac = String(abs % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)}.${frac}`;
}

/** Adds (`sign` 1) or removes (`sign` -1) one row from its day's totals; a day with no rows is dropped. */
function applyRow(
  summaries: Record<string, DayTransactionSummary>,
  row: TransactionRow,
  sign: 1 | -1,
): void {
  const date = transactionCalendarDayKey(row.transaction_at);
  const current = summaries[date];
  const cents = toCents(row.amount) * sign;
  const credit = toCents(current?.credit_total ?? "0") + (row.type === "credit" ? cents : 0);
  const debit = toCents(current?.debit_total ?? "0") + (row.type === "debit" ? cents : 0);
  const transaction_count = (current?.transaction_count ?? 0) + sign;

  if (transaction_count <= 0) {
    delete summaries[date];
    return;
  }
  summaries[date] = {
    date,
    credit_total: formatCents(credit),
    debit_total: formatCents(debit),
    net: formatCents(credit - debit),
    transaction_count,
  };
}

function rowsById(
  data: InfiniteData<TransactionListPage>,
): Map<string, TransactionRow> {
  const map = new Map<string, TransactionRow>();
  for (const page of data.pages) {
    for (const item of page.items) {
      map.set(item.id, item);
    }
  }
  return map;
}

function sameForTotals(a: TransactionRow, b: TransactionRow): boolean {
  return (
    a.amount === b.amount &&
    a.type === b.type &&
    a.transaction_at === b.transaction_at
  );
}

/**
 * The first page carries per-day totals for the whole month. A cache patch changes rows but not
 * those totals, which left new days looking empty and deleted days counted. Apply the row
 * difference between `prev` and `next` to the first page's `day_summaries`. Pages fetched
 * without totals (no timezone) are left alone.
 */
export function reconcileDaySummaries(
  prev: InfiniteData<TransactionListPage>,
  next: InfiniteData<TransactionListPage>,
): InfiniteData<TransactionListPage> {
  const prevSummaries = prev.pages[0]?.day_summaries;
  const nextFirst = next.pages[0];
  if (!prevSummaries || !nextFirst) {
    return next;
  }

  const before = rowsById(prev);
  const after = rowsById(next);
  const summaries = { ...prevSummaries };
  let changed = false;

  for (const [id, row] of before) {
    const updated = after.get(id);
    if (updated && sameForTotals(row, updated)) {
      continue;
    }
    applyRow(summaries, row, -1);
    changed = true;
    if (updated) {
      applyRow(summaries, updated, 1);
    }
  }
  for (const [id, row] of after) {
    if (!before.has(id)) {
      applyRow(summaries, row, 1);
      changed = true;
    }
  }

  if (!changed) {
    return next;
  }
  return {
    ...next,
    pages: [{ ...nextFirst, day_summaries: summaries }, ...next.pages.slice(1)],
  };
}

/**
 * Totals for the selected day. The server summary is the source of truth, but it can be missing
 * (list fetched without a timezone) or behind the rows already on screen (a patch landed first):
 * loaded rows are real, so when they outnumber the summary they win and the day is never shown
 * empty while its rows are listed.
 */
export function resolveDaySummary(
  dayKey: string,
  summary: DayTransactionSummary | undefined,
  dayRows: readonly TransactionRow[],
): DayTransactionSummary | undefined {
  if (dayRows.length === 0 || dayRows.length <= (summary?.transaction_count ?? 0)) {
    return summary;
  }
  const rebuilt: Record<string, DayTransactionSummary> = {};
  for (const row of dayRows) {
    applyRow(rebuilt, row, 1);
  }
  return rebuilt[dayKey] ?? summary;
}
