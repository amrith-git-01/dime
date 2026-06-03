import { lastDayOfMonth } from "date-fns";

import type { DailyCashflowRow } from "../types";

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

/** One x tick per day (chart scrolls horizontally when the month is long). */
export function buildCashflowXTickValues(lastDay: number): number[] {
  return Array.from({ length: lastDay }, (_, i) => i + 1);
}

export function buildCashflowYTickValues(
  yMax: number,
  tickCount = 4,
): number[] {
  if (yMax <= 0) {
    return [0];
  }
  const ticks: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    ticks.push((yMax / tickCount) * i);
  }
  return ticks;
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
