import { formatCents, toCents } from '../../core/decimal';
import type { Db } from '../../core/db';
import { localDate, monthRange } from '../../core/timezone';
import type { IsoRange } from '../../core/timezone';
import { fetchBudget } from '../budgets/repository';
import { fetchMetaByIds } from '../categories/repository';
import { loadPayeeTotals } from '../insights/service';
import { rollUpIncome, rollUpSpend } from '../insights/rollup';
import * as txRepo from '../transactions/repository';
import { loadPeriodSummary } from '../transactions/service';
import { MONTH_ABBR } from '../agent/dates';
import { formatInr } from './html';
import type { CategoryRow, ExpenseRow, RankedRow } from './html';

/**
 * Everything one digest email shows, aggregated in SQL (Python looped over raw rows): the period
 * summary (totals + debit by category), the payee totals, the 5 largest debits and the month
 * budget. Four concurrent reads, plus one categories lookup and, when a budget is set, the budget
 * month's summary.
 */

const TOP = 5;
const UNCATEGORIZED = '';

export interface DigestPayload {
  spent: string;
  income: string;
  net: string;
  payees: RankedRow[];
  incomeSources: RankedRow[];
  categories: CategoryRow[];
  topExpenses: ExpenseRow[];
  budgetLine: string;
  budgetPct: number | null;
  empty: boolean;
}

/** Top 5 by amount with bar widths relative to the largest (Python `_ranked_amounts`). */
function ranked(rows: readonly { display_name: string; total: string; cents: number }[]): RankedRow[] {
  const top = rows.slice(0, TOP);
  const max = top.reduce((m, r) => Math.max(m, r.cents), 0) || 1;
  return top.map((r) => [r.display_name, r.total, max > 0 ? r.cents / max : 0] as const);
}

export async function buildDigestPayload(
  db: Db,
  input: { userId: string; range: IsoRange; budgetYear: number; budgetMonth: number; tz: string },
): Promise<DigestPayload> {
  const scope = { db, userId: input.userId };
  const [summary, payeeRows, topRows, budgetRow] = await Promise.all([
    loadPeriodSummary(scope, input.range),
    loadPayeeTotals(scope, input.range),
    txRepo.topDebits(db, input.userId, input.range, TOP),
    fetchBudget(db, input.userId),
  ]);

  const debit = summary.debitCents;
  const credit = summary.creditCents;
  const spend = debit > 0 ? rollUpSpend(payeeRows, debit) : [];
  const income = credit > 0 ? rollUpIncome(payeeRows, credit) : [];

  const [categories, budget] = await Promise.all([
    categoryMix(db, input.userId, summary.debitByCategory, debit),
    budgetRemaining(scope, toCents(budgetRow?.monthly_budget ?? 0), input.budgetYear, input.budgetMonth, input.tz),
  ]);

  return {
    spent: formatCents(debit),
    income: formatCents(credit),
    net: formatCents(credit - debit),
    payees: ranked(spend.map((r) => ({ display_name: r.display_name, total: r.debit_total, cents: toCents(r.debit_total) }))),
    incomeSources: ranked(income.map((r) => ({ display_name: r.display_name, total: r.credit_total, cents: toCents(r.credit_total) }))),
    categories,
    topExpenses: topRows.map((row) => {
      const name = typeof row.counterparty_name === 'string' && row.counterparty_name.trim() ? row.counterparty_name.trim() : 'Expense';
      return [name, localDayLabel(row.transaction_at, input.tz), formatCents(toCents(row.amount))] as const;
    }),
    budgetLine: budget.line,
    budgetPct: budget.pct,
    empty: summary.count === 0 && debit === 0 && credit === 0,
  };
}

/** `12 Aug` for a transaction instant in the user's timezone; empty for an unparseable one. */
function localDayLabel(rawAt: unknown, tz: string): string {
  if (typeof rawAt !== 'string' || !rawAt.trim()) return '';
  const ms = Date.parse(rawAt);
  if (Number.isNaN(ms)) return '';
  const d = localDate(tz, ms);
  return `${d.day} ${MONTH_ABBR[d.month - 1] ?? ''}`;
}

async function categoryMix(
  db: Db,
  userId: string,
  debitByCategory: ReadonlyMap<string, number>,
  debitTotal: number,
): Promise<CategoryRow[]> {
  if (debitTotal <= 0) return [];
  const buckets = [...debitByCategory].map(([id, cents]) => [id.trim() === '' ? UNCATEGORIZED : id.trim().toLowerCase(), cents] as const);
  const ids = buckets.map(([id]) => id).filter((id) => id !== UNCATEGORIZED);
  const meta = await fetchMetaByIds(db, ids, userId);
  const sorted = [...buckets].sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] ?? 1;
  return sorted.map(([id, cents]) => {
    if (id === UNCATEGORIZED) return ['Uncategorized', formatCents(cents), max > 0 ? cents / max : 0, false] as const;
    const m = meta.get(id);
    const name = typeof m?.name === 'string' && m.name.trim() ? m.name.trim() : 'Category';
    // A category the user cannot see (deleted / not theirs) counts as custom, like Python's empty-meta default.
    const isCustom = !(m?.is_system === true);
    return [name, formatCents(cents), max > 0 ? cents / max : 0, isCustom] as const;
  });
}

async function budgetRemaining(
  scope: { db: Db; userId: string },
  monthlyCents: number,
  year: number,
  month: number,
  tz: string,
): Promise<{ line: string; pct: number | null }> {
  if (monthlyCents <= 0) return { line: 'No budget set', pct: null };
  const monthSummary = await loadPeriodSummary(scope, monthRange(tz, year, month));
  const remaining = monthlyCents - monthSummary.debitCents;
  return {
    line: `${formatInr(formatCents(remaining))} / ${formatInr(formatCents(monthlyCents))}`,
    pct: monthSummary.debitCents / monthlyCents,
  };
}
