import { formatCents } from '../../core/decimal';
import { dateKey, localDate, monthRange, parseTimezone } from '../../core/timezone';
import type { IsoRange } from '../../core/timezone';
import { dailyCashflowSeries, fixedFlexibleFields, sumDayTotals } from '../transactions/aggregates';
import * as txRepo from '../transactions/repository';
import type { PayeeRow } from '../transactions/repository';
import type { TransactionRow } from '../transactions/schemas';
import { enrichRows, loadDayTotals } from '../transactions/service';
import type { DbScope, TxContext } from '../transactions/service';
import { rollUpIncome, rollUpSpend } from './rollup';
import type { MonthInsightsResponse } from './schemas';

const TOP_EXPENSES = 5;

export function loadPayeeTotals(ctx: DbScope, range: IsoRange, opts: { flexibleDebitsOnly?: boolean } = {}): Promise<PayeeRow[]> {
  return txRepo.payeeTotals(ctx.db, ctx.userId, range, opts);
}

type MonthInsightsData = Omit<MonthInsightsResponse, 'top_expenses'> & { top_rows: TransactionRow[] };

/**
 * Everything in month insights except the media-signed top expenses (so callers that only need the
 * numbers, like the agent's compare path, do not pay for signing). One round of three concurrent
 * calls: daily totals, payee totals, top 5 debits; the summary is the sum of the daily totals.
 */
export async function monthInsightsData(
  ctx: DbScope,
  input: { year: number; month: number; timezone: string },
  opts: { top?: boolean; nowMs?: number } = {},
): Promise<MonthInsightsData> {
  const { year, month } = input;
  const tz = parseTimezone(input.timezone);
  const range = monthRange(tz, year, month);

  const [dayTotals, payees, topRows] = await Promise.all([
    loadDayTotals(ctx, range, tz),
    loadPayeeTotals(ctx, range, { flexibleDebitsOnly: true }),
    opts.top === false ? Promise.resolve([]) : txRepo.topDebits(ctx.db, ctx.userId, range, TOP_EXPENSES),
  ]);

  const totals = sumDayTotals(dayTotals);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => ({ year, month, day: i + 1 }));

  return {
    year,
    month,
    today: dateKey(localDate(tz, opts.nowMs ?? Date.now())),
    summary: {
      credit_total: formatCents(totals.creditCents),
      debit_total: formatCents(totals.debitCents),
      net: formatCents(totals.creditCents - totals.debitCents),
      transaction_count: totals.count,
      ...fixedFlexibleFields(totals),
    },
    daily_cashflow: dailyCashflowSeries(dayTotals, days),
    // "Who you paid" is flexible spend only, so its shares are of the flexible total.
    counterparty_spend: rollUpSpend(payees, totals.debitCents - totals.fixedDebitCents),
    counterparty_income: rollUpIncome(payees, totals.creditCents, { withOther: true }),
    top_rows: topRows,
  };
}

/** Month insights over the half-open `[month start, next month start)` in the user's timezone. */
export async function monthInsights(
  ctx: TxContext,
  input: { year: number; month: number; timezone: string },
): Promise<MonthInsightsResponse> {
  const { top_rows: topRows, ...rest } = await monthInsightsData(ctx, input);
  return { ...rest, top_expenses: await enrichRows(ctx, topRows) };
}
