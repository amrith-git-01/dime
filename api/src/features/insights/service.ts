import { formatCents } from '../../core/decimal';
import { dateKey, daysInMonth, localDate, monthDates, parseTimezone } from '../../core/timezone';
import { dailyCashflowSeries, fixedFlexibleFields, totalsOf } from '../transactions/aggregates';
import { dayTotals, payeeTotals, periodLedger, topSpends } from '../transactions/ledger';
import type { Window } from '../transactions/ledger';
import type { TransactionRow } from '../transactions/schemas';
import { enrichRows } from '../transactions/service';
import type { DbScope, TxContext } from '../transactions/service';
import { rollUpIncome, rollUpSpend } from './rollup';
import type { MonthInsightsResponse } from './schemas';

const TOP_EXPENSES = 5;

type MonthInsightsData = Omit<MonthInsightsResponse, 'top_expenses'> & { top_rows: TransactionRow[] };

/**
 * Everything in month insights except the media-signed top expenses (so callers that only need the
 * numbers do not pay for signing). One round of four concurrent ledger queries: the month's totals, daily totals,
 * payee totals, top 5 spends. Every figure comes from the one ledger definition (`transactions/ledger.ts`).
 */
export async function monthInsightsData(
  ctx: DbScope,
  input: { year: number; month: number; timezone: string },
  opts: { top?: boolean; nowMs?: number } = {},
): Promise<MonthInsightsData> {
  const { year, month } = input;
  const tz = parseTimezone(input.timezone);
  const window: Window = { dates: monthDates(year, month) };

  const [ledger, days, payees, topRows] = await Promise.all([
    periodLedger(ctx.db, ctx.userId, window),
    dayTotals(ctx.db, ctx.userId, window),
    payeeTotals(ctx.db, ctx.userId, window),
    opts.top === false ? Promise.resolve([]) : topSpends(ctx.db, ctx.userId, window, TOP_EXPENSES),
  ]);

  const totals = totalsOf(ledger);
  const dates = Array.from({ length: daysInMonth(year, month) }, (_, i) => ({ year, month, day: i + 1 }));

  return {
    year,
    month,
    today: dateKey(localDate(tz, opts.nowMs ?? Date.now())),
    summary: {
      credit_total: formatCents(totals.creditCents),
      debit_total: formatCents(totals.debitCents),
      net: formatCents(totals.creditCents - totals.debitCents),
      transaction_count: ledger.count,
      ...fixedFlexibleFields(totals),
      budget_spent: formatCents(ledger.budgetSpendCents),
      committed_total: formatCents(ledger.committedCents),
      transfer_total: formatCents(ledger.transferCents),
      payback_total: formatCents(ledger.paybackCents),
    },
    daily_cashflow: dailyCashflowSeries(days, dates),
    // "Who you paid" is flexible spend only, so its shares are of the flexible total.
    counterparty_spend: rollUpSpend(payees, totals.flexDebitCents),
    counterparty_income: rollUpIncome(payees, totals.creditCents, { withOther: true }),
    top_rows: topRows,
  };
}

/** Month insights over the user's calendar month (the rows' stored local months). */
export async function monthInsights(
  ctx: TxContext,
  input: { year: number; month: number; timezone: string },
): Promise<MonthInsightsResponse> {
  const { top_rows: topRows, ...rest } = await monthInsightsData(ctx, input);
  return { ...rest, top_expenses: await enrichRows(ctx, topRows) };
}
