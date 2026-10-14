import { formatCents, toCents } from '../../core/decimal';
import { dateKey, localDate } from '../../core/timezone';
import type { LocalDate } from '../../core/timezone';
import type { DayTransactionSummary } from './schemas';

/**
 * Pure aggregation helpers. Money is summed as integer cents so totals are exact (Python used
 * `Decimal`). Output formats match the Python response models: totals are "123.45"; an empty day in
 * a series is "0" (Python's `format(Decimal("0"), "f")`), a summary's missing side is "0.00".
 */

export interface DayTotals {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  creditCents: number;
  debitCents: number;
  /** Number of credit + debit rows that day. */
  count: number;
}

export interface AmountTypeAtRow {
  amount: number | string;
  type: string;
  transaction_at: string;
}

/** Bucket raw rows by local day (SQLite cannot cut days in an IANA timezone). */
export function dayTotalsFromRows(rows: readonly AmountTypeAtRow[], tz: string): DayTotals[] {
  const byDay = new Map<string, DayTotals>();
  for (const row of rows) {
    if (row.type !== 'credit' && row.type !== 'debit') continue;
    const ms = Date.parse(row.transaction_at);
    if (Number.isNaN(ms)) continue;
    const key = dateKey(localDate(tz, ms));
    const entry = byDay.get(key) ?? { day: key, creditCents: 0, debitCents: 0, count: 0 };
    const cents = toCents(row.amount);
    if (row.type === 'credit') entry.creditCents += cents;
    else entry.debitCents += cents;
    entry.count += 1;
    byDay.set(key, entry);
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** Sparse per-day credit/debit/net/count (only days that have transactions). */
export function buildDaySummaries(totals: readonly DayTotals[]): Record<string, DayTransactionSummary> {
  const out: Record<string, DayTransactionSummary> = {};
  for (const t of [...totals].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))) {
    if (t.count <= 0) continue;
    out[t.day] = {
      date: t.day,
      credit_total: formatCents(t.creditCents),
      debit_total: formatCents(t.debitCents),
      net: formatCents(t.creditCents - t.debitCents),
      transaction_count: t.count,
    };
  }
  return out;
}

const centsOrZero = (cents: number | undefined): string => (cents ? formatCents(cents) : '0');

/** Debit total for each of `days` (oldest first); a day without debits is "0". */
export function dailyDebitSeries(totals: readonly DayTotals[], days: readonly LocalDate[]): { date: string; total: string }[] {
  const byDay = new Map(totals.map((t) => [t.day, t]));
  return days.map((d) => {
    const key = dateKey(d);
    return { date: key, total: centsOrZero(byDay.get(key)?.debitCents) };
  });
}

/** Debit and credit total for each of `days`; a side without rows is "0". */
export function dailyCashflowSeries(
  totals: readonly DayTotals[],
  days: readonly LocalDate[],
): { date: string; debit_total: string; credit_total: string }[] {
  const byDay = new Map(totals.map((t) => [t.day, t]));
  return days.map((d) => {
    const key = dateKey(d);
    const t = byDay.get(key);
    return { date: key, debit_total: centsOrZero(t?.debitCents), credit_total: centsOrZero(t?.creditCents) };
  });
}

export function sumDayTotals(totals: readonly DayTotals[]): { creditCents: number; debitCents: number; count: number } {
  let creditCents = 0;
  let debitCents = 0;
  let count = 0;
  for (const t of totals) {
    creditCents += t.creditCents;
    debitCents += t.debitCents;
    count += t.count;
  }
  return { creditCents, debitCents, count };
}

/* ----------------------------------------------------------------------------------------------
 * Period summary (built by `repository.periodSummary`)
 * -------------------------------------------------------------------------------------------- */

export interface PeriodSummary {
  creditCents: number;
  debitCents: number;
  count: number;
  /** Debit cents by category id; the key is "" for uncategorized. */
  debitByCategory: Map<string, number>;
}

export const UNCATEGORIZED_KEY = '__uncategorized__';

/** month-summary `debit_by_category`: blank category -> `__uncategorized__`. */
export function debitByCategoryResponse(summary: PeriodSummary): Record<string, string> {
  const merged = new Map<string, number>();
  for (const [key, cents] of summary.debitByCategory) {
    const k = key.trim() === '' ? UNCATEGORIZED_KEY : key.trim();
    merged.set(k, cents);
  }
  return Object.fromEntries([...merged].map(([k, cents]) => [k, formatCents(cents)]));
}
