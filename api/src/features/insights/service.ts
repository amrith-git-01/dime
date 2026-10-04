import { formatCents } from '../../core/decimal';
import { addDays, dateKey, monthRange, parseTimezone, startOfLocalDay } from '../../core/timezone';
import type { IsoRange } from '../../core/timezone';
import { dailyCashflowSeries, sumDayTotals } from '../transactions/aggregates';
import * as txRepo from '../transactions/repository';
import type { PayeeRow } from '../transactions/repository';
import type { TransactionRow } from '../transactions/schemas';
import { enrichRows, loadDayTotals } from '../transactions/service';
import type { DbScope, TxContext } from '../transactions/service';
import { payeeTotalsFromRows, rollUpIncome, rollUpSpend } from './rollup';
import type { MonthInsightsResponse, MonthlyCashflowRow, YearInsightsResponse } from './schemas';

const TOP_EXPENSES = 5;

export async function loadPayeeTotals(ctx: DbScope, range: IsoRange): Promise<PayeeRow[]> {
  const fromRpc = await txRepo.rpcPayeeTotals(ctx.db, ctx.userId, range);
  if (fromRpc) return fromRpc;
  return payeeTotalsFromRows(await txRepo.fetchPayeeRows(ctx.db, ctx.userId, range));
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
  opts: { top?: boolean } = {},
): Promise<MonthInsightsData> {
  const { year, month } = input;
  const tz = parseTimezone(input.timezone);
  const range = monthRange(tz, year, month);

  const [dayTotals, payees, topRows] = await Promise.all([
    loadDayTotals(ctx, range, tz),
    loadPayeeTotals(ctx, range),
    opts.top === false ? Promise.resolve([]) : txRepo.topDebits(ctx.db, ctx.userId, range, TOP_EXPENSES),
  ]);

  const totals = sumDayTotals(dayTotals);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => ({ year, month, day: i + 1 }));

  return {
    year,
    month,
    summary: {
      credit_total: formatCents(totals.creditCents),
      debit_total: formatCents(totals.debitCents),
      net: formatCents(totals.creditCents - totals.debitCents),
      transaction_count: totals.count,
    },
    daily_cashflow: dailyCashflowSeries(dayTotals, days),
    counterparty_spend: rollUpSpend(payees, totals.debitCents),
    counterparty_income: rollUpIncome(payees, totals.creditCents),
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

const centsOrZero = (cents: number): string => (cents ? formatCents(cents) : '0');

/**
 * Insights for a calendar year or a year-to-date window (port of Python `year_insights`), in two
 * concurrent calls: per-day totals (bucketed into per-month cashflow, Jan .. the window's last
 * month) and per-payee totals (top payees + "Other"). `fromIso` / `toIso` carry the window's local
 * start and inclusive end; only their local dates matter (the end day is included).
 */
export async function yearInsights(
  ctx: DbScope,
  input: { fromIso: string; toIso: string; timezone: string },
): Promise<YearInsightsResponse> {
  const tz = parseTimezone(input.timezone);
  const from = parseIsoDay(input.fromIso);
  const to = parseIsoDay(input.toIso);
  const range: IsoRange = {
    from: new Date(startOfLocalDay(tz, from)).toISOString(),
    to: new Date(startOfLocalDay(tz, addDays(to, 1))).toISOString(),
  };

  const [dayTotals, payees] = await Promise.all([loadDayTotals(ctx, range, tz), loadPayeeTotals(ctx, range)]);
  const totals = sumDayTotals(dayTotals);

  const monthly_cashflow: MonthlyCashflowRow[] = [];
  for (let m = 1; m <= to.month; m++) {
    const prefix = `${dateKey({ year: from.year, month: m, day: 1 }).slice(0, 7)}-`;
    let debit = 0;
    let credit = 0;
    for (const t of dayTotals) {
      if (!t.day.startsWith(prefix)) continue;
      debit += t.debitCents;
      credit += t.creditCents;
    }
    monthly_cashflow.push({ month: m, date: `${prefix}01`, debit_total: centsOrZero(debit), credit_total: centsOrZero(credit) });
  }

  return {
    year: from.year,
    is_ytd: !(to.month === 12 && to.day === 31),
    summary: {
      credit_total: formatCents(totals.creditCents),
      debit_total: formatCents(totals.debitCents),
      net: formatCents(totals.creditCents - totals.debitCents),
      transaction_count: totals.count,
    },
    monthly_cashflow,
    top_payees: rollUpSpend(payees, totals.debitCents),
  };
}

function parseIsoDay(iso: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}
