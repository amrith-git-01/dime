import { MONTH_ABBR, parseIsoDate } from './dates';
import type { DimeSupabaseClient } from '../../core/supabase';
import type { MonthInsightsResponse, YearInsightsResponse } from '../insights/schemas';
import { monthInsightsData, yearInsights } from '../insights/service';
import type { CompareRange } from './time-range';

/**
 * Data for "A vs B" questions, served by the insights aggregates (no LLM SQL): a `compare_months`
 * block for the app plus a compact summary for the respond prompt (port of `compare_insights.py`).
 */

export interface ComparePayee {
  name: string;
  amount: number;
  share: number;
}

export interface ComparePeriodPayload {
  spent: number;
  income: number;
  net: number;
  cashflow: { date: string; expense: number; income: number }[];
  payees: ComparePayee[];
}

export interface CompareBlock {
  type: 'compare_months';
  chart_label?: string;
  period_a_label: string;
  period_b_label: string;
  period_a: ComparePeriodPayload;
  period_b: ComparePeriodPayload;
}

export interface CompareSummary {
  period_a_label: string;
  period_b_label: string;
  period_a: Record<string, unknown>;
  period_b: Record<string, unknown>;
  deltas: Record<string, number | null>;
}

const OTHER_KEY = '__other__';

/** Python `round((new - old) / old * 100, 1)`; null when there is no baseline. */
function pctChange(next: number, old: number): number | null {
  if (old === 0) return null;
  return Number((((next - old) / old) * 100).toFixed(1));
}

function periodPayloadFromMonth(ins: MonthInsightsResponse | Awaited<ReturnType<typeof monthInsightsData>>): ComparePeriodPayload {
  return {
    spent: Number(ins.summary.debit_total),
    income: Number(ins.summary.credit_total),
    net: Number(ins.summary.net),
    cashflow: ins.daily_cashflow.map((r) => ({ date: r.date, expense: Number(r.debit_total), income: Number(r.credit_total) })),
    payees: ins.counterparty_spend
      .filter((p) => p.payee_key !== OTHER_KEY)
      .map((p) => ({ name: p.display_name, amount: Number(p.debit_total), share: p.share })),
  };
}

function periodPayloadFromYear(ins: YearInsightsResponse): ComparePeriodPayload {
  return {
    spent: Number(ins.summary.debit_total),
    income: Number(ins.summary.credit_total),
    net: Number(ins.summary.net),
    cashflow: ins.monthly_cashflow.map((r) => ({ date: r.date, expense: Number(r.debit_total), income: Number(r.credit_total) })),
    payees: ins.top_payees
      .filter((p) => p.payee_key !== OTHER_KEY)
      .map((p) => ({ name: p.display_name, amount: Number(p.debit_total), share: p.share })),
  };
}

function dayStats(cashflow: ComparePeriodPayload['cashflow']) {
  const active = cashflow.filter((d) => d.expense > 0);
  if (active.length === 0) return { active: 0, peakDate: null as string | null, peakAmount: 0 };
  const peak = active.reduce((best, d) => (d.expense > best.expense ? d : best));
  return { active: active.length, peakDate: peak.date, peakAmount: peak.expense };
}

function monthStats(cashflow: ComparePeriodPayload['cashflow']) {
  const active = cashflow.filter((d) => d.expense > 0);
  if (active.length === 0) return { active: 0, peakMonth: null as string | null, peakAmount: 0 };
  const peak = active.reduce((best, d) => (d.expense > best.expense ? d : best));
  const idx = Number(peak.date.slice(5, 7)) - 1;
  return { active: active.length, peakMonth: MONTH_ABBR[idx] ?? peak.date, peakAmount: peak.expense };
}

export function buildCompareSummary(a: ComparePeriodPayload, b: ComparePeriodPayload, labels: { a: string; b: string }): CompareSummary {
  const ca = dayStats(a.cashflow);
  const cb = dayStats(b.cashflow);
  const side = (p: ComparePeriodPayload, c: typeof ca) => ({
    spent: p.spent,
    income: p.income,
    net: p.net,
    active_spend_days: c.active,
    peak_spend_date: c.peakDate,
    peak_spend_amount: c.peakAmount,
    top_payees: p.payees.slice(0, 4),
  });
  return {
    period_a_label: labels.a,
    period_b_label: labels.b,
    period_a: side(a, ca),
    period_b: side(b, cb),
    deltas: {
      spent_pct: pctChange(a.spent, b.spent),
      income_pct: pctChange(a.income, b.income),
      net_pct: pctChange(a.net, b.net),
      active_days_delta: ca.active - cb.active,
    },
  };
}

export function buildYearCompareSummary(a: ComparePeriodPayload, b: ComparePeriodPayload, labels: { a: string; b: string }): CompareSummary {
  const ca = monthStats(a.cashflow);
  const cb = monthStats(b.cashflow);
  const side = (p: ComparePeriodPayload, c: typeof ca) => ({
    spent: p.spent,
    income: p.income,
    net: p.net,
    active_spend_months: c.active,
    peak_spend_month: c.peakMonth,
    peak_spend_amount: c.peakAmount,
    top_payees: p.payees.slice(0, 4),
  });
  return {
    period_a_label: labels.a,
    period_b_label: labels.b,
    period_a: side(a, ca),
    period_b: side(b, cb),
    deltas: {
      spent_pct: pctChange(a.spent, b.spent),
      income_pct: pctChange(a.income, b.income),
      net_pct: pctChange(a.net, b.net),
    },
  };
}

function yearMonthOf(period: { start_iso: string }): { year: number; month: number } {
  const d = parseIsoDate(period.start_iso);
  return { year: d.year, month: d.month };
}

export async function fetchCompareInsights(
  db: DimeSupabaseClient,
  userId: string,
  range: CompareRange,
  timezone: string,
): Promise<{ block: CompareBlock; summary: CompareSummary }> {
  const scope = { db, userId };
  const a = yearMonthOf(range.period_a);
  const b = yearMonthOf(range.period_b);
  const [insA, insB] = await Promise.all([
    monthInsightsData(scope, { ...a, timezone }, { top: false }),
    monthInsightsData(scope, { ...b, timezone }, { top: false }),
  ]);
  const labelA = range.period_a.label || 'Period A';
  const labelB = range.period_b.label || 'Period B';
  const pa = periodPayloadFromMonth(insA);
  const pb = periodPayloadFromMonth(insB);
  return {
    block: { type: 'compare_months', period_a_label: labelA, period_b_label: labelB, period_a: pa, period_b: pb },
    summary: buildCompareSummary(pa, pb, { a: labelA, b: labelB }),
  };
}

export async function fetchYearCompareInsights(
  db: DimeSupabaseClient,
  userId: string,
  range: CompareRange,
  timezone: string,
): Promise<{ block: CompareBlock; summary: CompareSummary }> {
  const scope = { db, userId };
  const [insA, insB] = await Promise.all([
    yearInsights(scope, { fromIso: range.period_a.start_iso, toIso: range.period_a.end_iso, timezone }),
    yearInsights(scope, { fromIso: range.period_b.start_iso, toIso: range.period_b.end_iso, timezone }),
  ]);
  const labelA = range.period_a.label || String(insA.year);
  const labelB = range.period_b.label || String(insB.year);
  const pa = periodPayloadFromYear(insA);
  const pb = periodPayloadFromYear(insB);
  return {
    block: { type: 'compare_months', chart_label: 'Monthly Spend', period_a_label: labelA, period_b_label: labelB, period_a: pa, period_b: pb },
    summary: buildYearCompareSummary(pa, pb, { a: labelA, b: labelB }),
  };
}
