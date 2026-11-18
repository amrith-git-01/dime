import { formatCents } from '../../core/decimal';
import { dateKey } from '../../core/timezone';
import type { LocalDate } from '../../core/timezone';
import type { LedgerTotals, PeriodLedger } from './ledger';
import type { BudgetPicture, DayTransactionSummary } from './schemas';

/**
 * Pure shaping helpers over the ledger's totals (`ledger.ts` owns the SQL). Money is integer cents so totals are exact. Output
 * formats: totals are "123.45"; an empty day in a series is "0", a summary's missing side is "0.00".
 */

/** One local day of the ledger: `creditCents` is income, `debitCents` is spend (net of paybacks, transfers in neither). */
export interface DayTotals {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  creditCents: number;
  debitCents: number;
  /** Part of `creditCents` / `debitCents` that is fixed (recurring). */
  fixedCreditCents: number;
  fixedDebitCents: number;
  /** Number of rows that day, transfers included. */
  count: number;
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
      fixed_debit_total: formatCents(t.fixedDebitCents),
      fixed_credit_total: formatCents(t.fixedCreditCents),
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

/** Debit and credit total (and their fixed parts) for each of `days`; a side without rows is "0". */
export function dailyCashflowSeries(
  totals: readonly DayTotals[],
  days: readonly LocalDate[],
): { date: string; debit_total: string; credit_total: string; fixed_debit_total: string; fixed_credit_total: string }[] {
  const byDay = new Map(totals.map((t) => [t.day, t]));
  return days.map((d) => {
    const key = dateKey(d);
    const t = byDay.get(key);
    return {
      date: key,
      debit_total: centsOrZero(t?.debitCents),
      credit_total: centsOrZero(t?.creditCents),
      fixed_debit_total: centsOrZero(t?.fixedDebitCents),
      fixed_credit_total: centsOrZero(t?.fixedCreditCents),
    };
  });
}

export interface Totals {
  creditCents: number;
  debitCents: number;
  fixedCreditCents: number;
  fixedDebitCents: number;
  /** Everyday spend, floored on its own by the ledger (never `debitCents - fixedDebitCents` of floored values). */
  flexDebitCents: number;
}

/** The fixed / flexible split of a total, as the response's decimal strings. */
export function fixedFlexibleFields(t: Totals): {
  fixed_debit_total: string;
  flexible_debit_total: string;
  fixed_credit_total: string;
  flexible_credit_total: string;
} {
  return {
    fixed_debit_total: formatCents(t.fixedDebitCents),
    flexible_debit_total: formatCents(t.flexDebitCents),
    fixed_credit_total: formatCents(t.fixedCreditCents),
    flexible_credit_total: formatCents(t.creditCents - t.fixedCreditCents),
  };
}

export const UNCATEGORIZED_KEY = '__uncategorized__';

/** month-summary `debit_by_category`: blank category -> `__uncategorized__`; categories whose spend nets to zero are left out. */
export function debitByCategoryResponse(spendByCategory: ReadonlyMap<string, number>): Record<string, string> {
  const merged = new Map<string, number>();
  for (const [key, cents] of spendByCategory) {
    if (cents === 0) continue;
    merged.set(key.trim() === '' ? UNCATEGORIZED_KEY : key.trim(), cents);
  }
  return Object.fromEntries([...merged].map(([k, cents]) => [k, formatCents(cents)]));
}

/** The additive budget fields of the month views, from the ledger and the month's cap (cents, 0 = none). */
export function budgetPicture(ledger: LedgerTotals, capCents: number): BudgetPicture {
  return {
    budget_spent: formatCents(ledger.budgetSpendCents),
    budget_left: capCents > 0 ? formatCents(capCents - ledger.budgetSpendCents) : null,
    committed_total: formatCents(ledger.committedCents),
    transfer_total: formatCents(ledger.transferCents),
    payback_total: formatCents(ledger.paybackCents),
    monthly_budget: capCents > 0 ? formatCents(capCents) : null,
  };
}

/** Credit / debit totals of a ledger window as the response's `Totals`. */
export function totalsOf(ledger: PeriodLedger): Totals {
  return { creditCents: ledger.incomeCents, debitCents: ledger.spendCents, fixedCreditCents: ledger.fixedIncomeCents, fixedDebitCents: ledger.fixedSpendCents, flexDebitCents: ledger.flexSpendCents };
}
