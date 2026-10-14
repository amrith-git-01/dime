import { formatInrCompact } from "@/utils/currency";
import { paiseToRupees } from "@/utils/paise";

import type { DailyCashflowRow } from "../types";
import { buildBurnRateSeries } from "./buildBurnRateSeries";
import { calendarDaysInMonth, isCurrentMonth } from "./buildCashflowWindow";
import { fixedPlanPaise, type FixedPlanItem } from "./fixedPlan";

export type InsightsBurnRateMetrics = {
  spentSoFar: number;
  spentDisplay: string;
  spentLabel: string;
  idealPace: number | null;
  idealDisplay: string;
  idealLabel: string;
  hasMonthlyBudget: boolean;
  monthlyBudget: number | null;
  isOverPace: boolean;
  projected: number;
  projectedDisplay: string;
  projectedLabel: string;
  /** Fixed expenses this month, paid and still to come (rupees); 0 when there are none. */
  fixedPlan: number;
  fixedPlanDisplay: string;
  /** Spend that is not fixed, so far (rupees). */
  flexibleSpent: number;
  flexibleSpentDisplay: string;
  /** Budget left for flexible spend after the fixed plan (never negative); null without a budget. */
  flexibleAllowance: number | null;
  flexibleAllowanceDisplay: string;
};

export type BurnRateOptions = {
  /** This month's fixed expenses (paid + upcoming). Omit for the plain straight-line pace. */
  fixedItems?: readonly FixedPlanItem[];
  /**
   * Fixed spend posted so far, from the month summary. Fixed spend entered by hand (a recurring category
   * without a recurring item) is not in `fixedItems`; the difference is treated as already planned and paid.
   */
  fixedSpentSoFar?: number;
  /** The server's today; defaults to the device clock. */
  today?: Date;
};

/**
 * Pace KPIs from the cumulative debit series.
 *
 * - ideal(refDay): fixed amounts due by refDay plus the flexible allowance spread evenly (see `buildBurnRateSeries`).
 * - projection (current month): fixed plan + flexible spend so far / refDay * days in month.
 *   Past months just report the final total.
 */
export function computeBurnRateMetrics(
  dailyCashflow: DailyCashflowRow[],
  monthlyBudget: number | null,
  year: number,
  monthIndex0: number,
  options: BurnRateOptions = {},
): InsightsBurnRateMetrics | null {
  const daysInMonth = calendarDaysInMonth(year, monthIndex0);
  if (daysInMonth < 1 || dailyCashflow.length === 0) {
    return null;
  }

  const budget =
    monthlyBudget != null && Number.isFinite(monthlyBudget) && monthlyBudget > 0
      ? monthlyBudget
      : null;
  const hasMonthlyBudget = budget != null;
  const now = options.today ?? new Date();
  const current = isCurrentMonth(year, monthIndex0, now);
  const referenceDay = current
    ? Math.min(now.getDate(), daysInMonth)
    : daysInMonth;

  const items = options.fixedItems ?? [];
  const paidPaise = fixedPlanPaise(items, (item) => item.paid);
  const fixedSpentPaise = Math.max(
    paidPaise,
    Math.round((options.fixedSpentSoFar ?? 0) * 100),
  );
  const strayPaise = fixedSpentPaise - paidPaise;
  const plan: FixedPlanItem[] =
    strayPaise > 0
      ? [...items, { day: 1, amount: paiseToRupees(strayPaise), paid: true }]
      : [...items];
  const planPaise = fixedPlanPaise(plan);

  const points = buildBurnRateSeries(dailyCashflow, budget, plan);
  const refPoint =
    points.find((p) => p.day === referenceDay) ?? points[points.length - 1];
  const spentSoFar = refPoint.spent;
  const idealPace = refPoint.pace;

  const flexibleSpent = Math.max(
    0,
    spentSoFar - paiseToRupees(fixedSpentPaise),
  );
  const dailyFlexibleRate = referenceDay > 0 ? flexibleSpent / referenceDay : 0;
  const projected = current
    ? paiseToRupees(planPaise) + dailyFlexibleRate * daysInMonth
    : spentSoFar;
  const flexibleAllowance =
    budget != null ? Math.max(0, budget - paiseToRupees(planPaise)) : null;

  const idealLabel = current ? "Ideal by today" : "Ideal pace";

  return {
    spentSoFar,
    spentDisplay: formatInrCompact(spentSoFar),
    spentLabel: current ? "Spent so far" : "Total spent",
    idealPace,
    idealDisplay: idealPace != null ? formatInrCompact(idealPace) : "—",
    idealLabel,
    hasMonthlyBudget,
    monthlyBudget: budget,
    isOverPace: idealPace != null && idealPace > 0 && spentSoFar > idealPace,
    projected,
    projectedDisplay: formatInrCompact(projected),
    projectedLabel: current ? "At this pace" : "Final total",
    fixedPlan: paiseToRupees(planPaise),
    fixedPlanDisplay: formatInrCompact(paiseToRupees(planPaise)),
    flexibleSpent,
    flexibleSpentDisplay: formatInrCompact(flexibleSpent),
    flexibleAllowance,
    flexibleAllowanceDisplay:
      flexibleAllowance != null ? formatInrCompact(flexibleAllowance) : "—",
  };
}
