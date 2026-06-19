import { lastDayOfMonth } from "date-fns";

import type { DailyCashflowRow } from "../types";
import {
  buildClusteredCashflowScale,
  collectCashflowRowValues,
  scaleCashflowVictoryRow,
} from "./cashflowClusterScale";

export type DailyCashflowDay = {
  date: string;
  day: number;
  expense: number;
  income: number;
  net: number;
};

export function parseDailyCashflow(
  rows: DailyCashflowRow[],
): DailyCashflowDay[] {
  return rows.map((row) => {
    const expense = Number.parseFloat(row.debit_total);
    const income = Number.parseFloat(row.credit_total);
    const safeExpense = Number.isFinite(expense) ? expense : 0;
    const safeIncome = Number.isFinite(income) ? income : 0;
    const day = Number.parseInt(row.date.slice(8, 10), 10);
    return {
      date: row.date,
      day: Number.isFinite(day) ? day : 1,
      expense: safeExpense,
      income: safeIncome,
      net: safeIncome - safeExpense,
    };
  });
}

export function isCurrentMonth(year: number, monthIndex0: number): boolean {
  const now = new Date();
  return now.getFullYear() === year && now.getMonth() === monthIndex0;
}

/** Last calendar day in the month (28–31), including future days in the current month. */
export function calendarDaysInMonth(year: number, monthIndex0: number): number {
  return lastDayOfMonth(new Date(year, monthIndex0, 1)).getDate();
}

/** Minimum chart width so each day gets a readable slot when scrolled horizontally. */
export const CASHFLOW_DAY_SLOT_WIDTH = 34;

/** X position before day 1 so lines meet the y-axis without clipping. */
export const CHART_LEADING_ANCHOR_DAY = 0;

/** X position after the last calendar day so the final bar/label is not clipped. */
export function chartTrailingAnchorDay(lastCalendarDay: number): number {
  return lastCalendarDay + 1;
}

/** Leading + trailing anchor slots plus each calendar day in the month. */
export function cashflowChartScrollWidth(monthDayCount: number): number {
  return (Math.max(monthDayCount, 1) + 2) * CASHFLOW_DAY_SLOT_WIDTH;
}

export type MonthCashflowSeries = {
  monthDays: DailyCashflowDay[];
  lastDay: number;
  todayDay: number | null;
};

/** One point per calendar day in the month (zeros when no transactions). */
export function buildFullMonthCashflowDays(
  rows: DailyCashflowRow[],
  year: number,
  monthIndex0: number,
): MonthCashflowSeries {
  const parsed = parseDailyCashflow(rows);
  const byDay = new Map(parsed.map((d) => [d.day, d]));
  const lastDay = calendarDaysInMonth(year, monthIndex0);
  const month = String(monthIndex0 + 1).padStart(2, "0");
  const todayDay = isCurrentMonth(year, monthIndex0)
    ? new Date().getDate()
    : null;

  const monthDays: DailyCashflowDay[] = [];
  for (let day = 1; day <= lastDay; day++) {
    const existing = byDay.get(day);
    if (existing) {
      monthDays.push(existing);
      continue;
    }
    monthDays.push({
      date: `${year}-${month}-${String(day).padStart(2, "0")}`,
      day,
      expense: 0,
      income: 0,
      net: 0,
    });
  }

  return { monthDays, lastDay, todayDay };
}

export type CashflowChartRowY = {
  expense: number;
  income: number;
  netSurplus: number;
  netDeficit: number;
};

export const ZERO_CASHFLOW_CHART_ROW: CashflowChartRowY = {
  expense: 0,
  income: 0,
  netSurplus: 0,
  netDeficit: 0,
};

export type CashflowVictoryChartRow = { day: number } & CashflowChartRowY;

export function netBarInnerPadding(dayCount: number): number {
  if (dayCount <= 10) return 0.22;
  if (dayCount <= 20) return 0.14;
  return 0.2;
}

export function maxCashflowChartY(rows: CashflowChartRowY[]): number {
  let maxY = 0;
  for (const row of rows) {
    maxY = Math.max(
      maxY,
      row.expense,
      row.income,
      row.netSurplus,
      row.netDeficit,
    );
  }
  return maxY;
}

export type MonthlyCashflowChartModel = {
  chartData: CashflowVictoryChartRow[];
  yMax: number;
  barPadding: number;
  yTickValues: number[];
  yScale: ClusteredCashflowScaleRef;
};

/** Clustered scale metadata exposed to chart consumers (axis labels). */
export type ClusteredCashflowScaleRef = {
  breaks: number[];
  rawMax: number;
};

/** Shared Victory cashflow rows + clustered y-scale for Insights and compare charts. */
export function buildMonthlyCashflowChartModel(
  monthDays: DailyCashflowDay[],
  trailingAnchorDay: number,
): MonthlyCashflowChartModel {
  const monthRows = monthDays.map((d) => ({
    day: d.day,
    expense: d.expense,
    income: d.income,
    netSurplus: d.net > 0 ? d.net : 0,
    netDeficit: d.net < 0 ? Math.abs(d.net) : 0,
  }));
  const rawChartData: CashflowVictoryChartRow[] = [
    { day: CHART_LEADING_ANCHOR_DAY, ...ZERO_CASHFLOW_CHART_ROW },
    ...monthRows,
    { day: trailingAnchorDay, ...ZERO_CASHFLOW_CHART_ROW },
  ];

  const yScale = buildClusteredCashflowScale(
    collectCashflowRowValues(rawChartData),
  );
  const chartData = rawChartData.map((row) =>
    scaleCashflowVictoryRow(row, yScale),
  );

  return {
    chartData,
    yMax: yScale.yDomainMax,
    barPadding: netBarInnerPadding(monthRows.length),
    yTickValues: yScale.yTickLabels,
    yScale: { breaks: yScale.breaks, rawMax: yScale.rawMax },
  };
}

export function formatCashflowXLabel(
  day: number,
  todayDay: number | null,
): string {
  if (todayDay != null && day === todayDay) {
    return "Today";
  }
  return String(day);
}

/** Horizontal scroll offset that centers today's column in the viewport. */
export function cashflowScrollOffsetForToday(
  todayDay: number,
  viewportWidth: number,
  contentWidth: number,
): number {
  const todayStart = todayDay * CASHFLOW_DAY_SLOT_WIDTH;
  const centered = todayStart - viewportWidth / 2 + CASHFLOW_DAY_SLOT_WIDTH / 2;
  const maxOffset = Math.max(0, contentWidth - viewportWidth);
  return Math.min(maxOffset, Math.max(0, centered));
}
