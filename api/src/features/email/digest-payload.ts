import { formatCents, toCents } from '../../core/decimal';
import type { Db } from '../../core/db';
import { IST, localDate, monthDates, monthKey } from '../../core/timezone';
import { monthlyCapCents } from '../budgets/history';
import { fetchMetaByIds } from '../categories/repository';
import { rollUpIncome, rollUpSpend } from '../insights/rollup';
import { payeeTotals, periodLedger, topSpends } from '../transactions/ledger';
import type { Window } from '../transactions/ledger';
import { MONTH_ABBR } from '../agent/dates';
import { formatInr } from './html';
import type { CategoryRow, ExpenseRow, RankedRow } from './html';

/**
 * Everything one digest email shows, aggregated in SQL by the one ledger definition (`transactions/ledger.ts`): the period's
 * totals and category mix, the payee totals, the 5 largest spends and the budget month's progress. "Spent" is spend net of
 * paybacks with transfers left out; the payees, categories and biggest items are everyday (flexible) spend, so rent and EMI
 * never show up as a splurge. Four concurrent reads, plus one categories lookup and the budget month's ledger.
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
}

/** Top 5 by amount with bar widths relative to the largest (Python `_ranked_amounts`). */
function ranked(rows: readonly { display_name: string; total: string; cents: number }[]): RankedRow[] {
  const top = rows.slice(0, TOP);
  const max = top.reduce((m, r) => Math.max(m, r.cents), 0) || 1;
  return top.map((r) => [r.display_name, r.total, max > 0 ? r.cents / max : 0] as const);
}

export async function buildDigestPayload(
  db: Db,
  input: { userId: string; dates: { from: string; to: string }; budgetYear: number; budgetMonth: number },
): Promise<DigestPayload> {
  const window: Window = { dates: input.dates };
  const [ledger, payeeRows, topRows] = await Promise.all([
    periodLedger(db, input.userId, window),
    payeeTotals(db, input.userId, window),
    topSpends(db, input.userId, window, TOP),
  ]);

  const flexibleSpend = ledger.flexSpendCents;
  const spend = flexibleSpend > 0 ? rollUpSpend(payeeRows, flexibleSpend) : [];
  const income = ledger.incomeCents > 0 ? rollUpIncome(payeeRows, ledger.incomeCents) : [];

  const [categories, budget] = await Promise.all([
    categoryMix(db, input.userId, ledger.flexSpendByCategory, flexibleSpend),
    budgetRemaining(db, input.userId, input.budgetYear, input.budgetMonth),
  ]);

  return {
    spent: formatCents(ledger.spendCents),
    income: formatCents(ledger.incomeCents),
    net: formatCents(ledger.incomeCents - ledger.spendCents),
    payees: ranked(spend.map((r) => ({ display_name: r.display_name, total: r.debit_total, cents: toCents(r.debit_total) }))),
    incomeSources: ranked(income.map((r) => ({ display_name: r.display_name, total: r.credit_total, cents: toCents(r.credit_total) }))),
    categories,
    topExpenses: topRows.map((row) => {
      const name = typeof row.counterparty_name === 'string' && row.counterparty_name.trim() ? row.counterparty_name.trim() : 'Expense';
      return [name, dayLabel(row.local_date ?? null, row.transaction_at), formatCents(row.effective_cents)] as const;
    }),
    budgetLine: budget.line,
    budgetPct: budget.pct,
  };
}

/** `12 Aug` for a row's local day (its own stored date; an unbackfilled row is placed by its instant in IST); empty when unreadable. */
function dayLabel(storedDate: string | null, rawAt: unknown): string {
  const match = storedDate ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(storedDate) : null;
  let d: { month: number; day: number } | null = match ? { month: Number(match[2]), day: Number(match[3]) } : null;
  if (!d && typeof rawAt === 'string' && rawAt.trim()) {
    const ms = Date.parse(rawAt);
    if (!Number.isNaN(ms)) d = localDate(IST, ms);
  }
  return d ? `${d.day} ${MONTH_ABBR[d.month - 1] ?? ''}` : '';
}

async function categoryMix(
  db: Db,
  userId: string,
  spendByCategory: ReadonlyMap<string, number>,
  spendTotal: number,
): Promise<CategoryRow[]> {
  if (spendTotal <= 0) return [];
  const buckets = [...spendByCategory]
    .filter(([, cents]) => cents > 0)
    .map(([id, cents]) => [id.trim() === '' ? UNCATEGORIZED : id.trim().toLowerCase(), cents] as const);
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

/** Budget progress of the budget month: that month's cap (from the budget history) against the spend that counts toward it. */
async function budgetRemaining(db: Db, userId: string, year: number, month: number): Promise<{ line: string; pct: number | null }> {
  const monthlyCents = await monthlyCapCents(db, userId, monthKey(year, month));
  if (monthlyCents <= 0) return { line: 'No budget set', pct: null };
  const monthLedger = await periodLedger(db, userId, { dates: monthDates(year, month) });
  const remaining = monthlyCents - monthLedger.budgetSpendCents;
  return {
    line: `${formatInr(formatCents(remaining))} / ${formatInr(formatCents(monthlyCents))}`,
    pct: monthLedger.budgetSpendCents / monthlyCents,
  };
}
