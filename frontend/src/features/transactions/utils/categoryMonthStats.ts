import { format, getDaysInMonth, parseISO } from "date-fns";

import { formatInrCompact } from "@/utils/currency";
import { toPaise } from "@/utils/paise";

import type { TransactionRow } from "../types";

import { transactionCategoryKey } from "./filterTransactionsByCategory";
import type { MonthRef } from "./monthListFilter";

/**
 * Pure maths and wording for the category month card on the category transactions screen: month
 * stepping, the cap bar, the pace line, the "same point last month" comparison and the three
 * small stats. Money is integer paise throughout; amounts are shown in whole rupees.
 */

/** How far back the navigator reaches by default (the current month plus 11, as the other month pickers). */
const MONTHS_BACK = 11;

const monthIndexOf = (m: MonthRef) => m.year * 12 + m.monthIndex0;

export function shiftMonth(month: MonthRef, delta: number): MonthRef {
  const target = monthIndexOf(month) + delta;
  return { year: Math.floor(target / 12), monthIndex0: ((target % 12) + 12) % 12 };
}

export function isSameMonth(a: MonthRef, b: MonthRef): boolean {
  return monthIndexOf(a) === monthIndexOf(b);
}

/** The earliest month the navigator reaches: 11 months back, or the route's month when that is older. */
export function earliestSelectableMonth(routeMonth: MonthRef, current: MonthRef): MonthRef {
  const floor = shiftMonth(current, -MONTHS_BACK);
  return monthIndexOf(routeMonth) < monthIndexOf(floor) ? routeMonth : floor;
}

/** `month` limited to the window `[earliest, latest]`. */
export function clampMonth(month: MonthRef, earliest: MonthRef, latest: MonthRef): MonthRef {
  if (monthIndexOf(month) > monthIndexOf(latest)) return latest;
  if (monthIndexOf(month) < monthIndexOf(earliest)) return earliest;
  return month;
}

export function monthFullName(month: MonthRef): string {
  return format(new Date(month.year, month.monthIndex0, 1), "MMMM");
}

export function monthShortName(month: MonthRef): string {
  return format(new Date(month.year, month.monthIndex0, 1), "MMM");
}

export function monthLabel(month: MonthRef): string {
  return format(new Date(month.year, month.monthIndex0, 1), "MMMM yyyy");
}

export type MonthClock = {
  isCurrent: boolean;
  daysInMonth: number;
  /** Today's day of the month; null for any month but the current one. */
  dayOfMonth: number | null;
  /** Days left including today; null for any month but the current one. */
  daysRemaining: number | null;
};

export function monthClock(month: MonthRef, now: Date): MonthClock {
  const daysInMonth = getDaysInMonth(new Date(month.year, month.monthIndex0, 1));
  const isCurrent = isSameMonth(month, { year: now.getFullYear(), monthIndex0: now.getMonth() });
  const dayOfMonth = isCurrent ? now.getDate() : null;
  return {
    isCurrent,
    daysInMonth,
    dayOfMonth,
    daysRemaining: dayOfMonth === null ? null : daysInMonth - dayOfMonth + 1,
  };
}

const money = (paise: number) => formatInrCompact(paise / 100);

// ---------------------------------------------------------------------------
// Cap
// ---------------------------------------------------------------------------

export type CapTone = "accent" | "warning" | "danger";

export type CapState = {
  /** 0..1, for the bar. */
  progress: number;
  /** Rounded percent of the cap spent; may exceed 100. */
  percent: number;
  over: boolean;
  tone: CapTone;
  leftPaise: number;
  metaLine: string;
};

/**
 * Accent up to 80% of the cap, warning above that, danger once the cap is passed. "Left" and
 * "over" are measured against the whole month's spend (future-dated debits included): that money
 * is already committed, so it is not "to date".
 */
export function capState(spentPaise: number, capPaise: number): CapState {
  const ratio = capPaise > 0 ? spentPaise / capPaise : 0;
  const percent = Math.round(ratio * 100);
  const over = spentPaise > capPaise;
  const tone: CapTone = over ? "danger" : ratio > 0.8 ? "warning" : "accent";
  const metaLine = over
    ? `${money(spentPaise - capPaise)} over ${money(capPaise)} · ${percent}%`
    : `${money(capPaise - spentPaise)} left of ${money(capPaise)} · ${percent}%`;
  return {
    progress: Math.max(0, Math.min(1, ratio)),
    percent,
    over,
    tone,
    leftPaise: capPaise - spentPaise,
    metaLine,
  };
}

/**
 * "₹183/day for the next 22 days": what is left of the cap spread over the days left including
 * today, rounded down so it never promises more than is left. Null when nothing is left or the
 * share rounds to under a rupee.
 */
export function paceLine(leftPaise: number, daysRemaining: number): string | null {
  if (leftPaise <= 0 || daysRemaining < 1) {
    return null;
  }
  const perDayRupees = Math.floor(leftPaise / 100 / daysRemaining);
  if (perDayRupees < 1) {
    return null;
  }
  return `${formatInrCompact(perDayRupees)}/day for the next ${daysRemaining} ${
    daysRemaining === 1 ? "day" : "days"
  }`;
}

// ---------------------------------------------------------------------------
// Comparison with the previous month
// ---------------------------------------------------------------------------

export type ComparisonWindow = {
  previousMonth: MonthRef;
  /** `to-date`: the previous month up to the same day of the month; `full`: all of it. */
  mode: "to-date" | "full";
  /** Last day of the previous month the comparison counts (clamped to its length). */
  cutoffDay: number;
};

/**
 * The current month is compared at the same point last month (day 1..today against day 1..the
 * same day, clamped when last month is shorter); a past month, in full against the month before.
 */
export function comparisonWindow(month: MonthRef, now: Date): ComparisonWindow {
  const previousMonth = shiftMonth(month, -1);
  const previousDays = getDaysInMonth(new Date(previousMonth.year, previousMonth.monthIndex0, 1));
  const clock = monthClock(month, now);
  if (clock.dayOfMonth === null) {
    return { previousMonth, mode: "full", cutoffDay: previousDays };
  }
  return { previousMonth, mode: "to-date", cutoffDay: Math.min(clock.dayOfMonth, previousDays) };
}

function isCategoryDebit(row: TransactionRow, categoryId: string): boolean {
  return row.type === "debit" && transactionCategoryKey(row) === categoryId;
}

/** A category's debits (paise) in `rows` on the days of the month up to and including `cutoffDay`. */
export function sumCategoryDebitsUpToDay(
  rows: readonly TransactionRow[],
  categoryId: string,
  month: MonthRef,
  cutoffDay: number,
): number {
  let total = 0;
  for (const row of rows) {
    if (!isCategoryDebit(row, categoryId)) continue;
    const at = parseISO(row.transaction_at);
    if (
      at.getFullYear() === month.year &&
      at.getMonth() === month.monthIndex0 &&
      at.getDate() <= cutoffDay
    ) {
      total += toPaise(row.amount);
    }
  }
  return total;
}

/** How many of `rows` are debits of the category (credits such as refunds are not payments). */
export function countCategoryDebits(rows: readonly TransactionRow[], categoryId: string): number {
  let count = 0;
  for (const row of rows) {
    if (isCategoryDebit(row, categoryId)) count += 1;
  }
  return count;
}

/** A category's debits (paise) in `rows` on one local day (`yyyy-MM-dd`). */
export function sumCategoryDebitsOnDay(
  rows: readonly TransactionRow[],
  categoryId: string,
  dayKey: string,
): number {
  let total = 0;
  for (const row of rows) {
    if (isCategoryDebit(row, categoryId) && format(parseISO(row.transaction_at), "yyyy-MM-dd") === dayKey) {
      total += toPaise(row.amount);
    }
  }
  return total;
}

export type SpendComparison =
  | { kind: "none" }
  | { kind: "same" }
  | { kind: "more" | "less"; deltaPaise: number };

/**
 * More, less or the same as before, judged on the whole rupees that are shown (so "▲ ₹0" cannot
 * happen). Nothing to compare when the earlier period had no spend.
 */
export function compareSpend(currentPaise: number, previousPaise: number): SpendComparison {
  if (previousPaise <= 0) {
    return { kind: "none" };
  }
  const deltaRupees = Math.round(currentPaise / 100) - Math.round(previousPaise / 100);
  if (deltaRupees === 0) {
    return { kind: "same" };
  }
  return { kind: deltaRupees > 0 ? "more" : "less", deltaPaise: Math.abs(deltaRupees) * 100 };
}

// ---------------------------------------------------------------------------
// The card's view
// ---------------------------------------------------------------------------

export type Loadable<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; value: T };

export type CapView =
  | { state: "loading" }
  | { state: "ready"; progress: number; tone: CapTone; metaLine: string };

export type CardStat = {
  label: string;
  /** Null while loading (a skeleton); "—" when it could not be worked out. */
  value: string | null;
};

export type CompareStat = CardStat & {
  tone: "neutral" | "danger" | "success";
  accessibilityLabel: string;
};

export type CategoryMonthView = {
  /** Null while loading. */
  hero: string | null;
  over: boolean;
  /** Present when the category has a cap (or it is still loading). */
  cap: CapView | null;
  /** True when there is no cap yet and one can be set. */
  offerSetCap: boolean;
  paceLine: string | null;
  stats: { primary: CardStat; payments: CardStat; compare: CompareStat };
};

export type CategoryMonthViewInput = {
  month: MonthRef;
  now: Date;
  /** The monthly cap in paise; `null` when the category has none (or it cannot have one). */
  cap: Loadable<number | null>;
  /** Whether a cap can be set at all (false for "uncategorized" or a category the user cannot edit). */
  canSetCap: boolean;
  /** The whole month's spend (the summary): the hero, the bar, "left" and the pace. */
  spentPaise: Loadable<number>;
  /** This month's spend over the days the comparison covers (days 1..today for the current month). */
  comparedPaise: Loadable<number>;
  /** False where there is nothing to compare with (the current month of "uncategorized"). */
  comparable: boolean;
  /** Spend today, from the loaded rows (current month only). */
  todayPaise: Loadable<number>;
  payments: Loadable<{ count: number; hasMore: boolean }>;
  /** The previous month's spend over the same days. */
  previousPaise: Loadable<number>;
};

const DASH = "—";

function textOf<T>(source: Loadable<T>, render: (value: T) => string): string | null {
  if (source.status === "loading") return null;
  if (source.status === "error") return DASH;
  return render(source.value);
}

function buildCompare(
  month: MonthRef,
  now: Date,
  spent: Loadable<number>,
  previous: Loadable<number>,
  comparable: boolean,
): CompareStat {
  const window = comparisonWindow(month, now);
  const label = `vs ${monthShortName(window.previousMonth)}`;
  const previousName = monthFullName(window.previousMonth);
  const since =
    window.mode === "to-date" ? `by ${window.cutoffDay} ${previousName}` : previousName;

  if (!comparable) {
    return { label, value: DASH, tone: "neutral", accessibilityLabel: "No comparison" };
  }
  if (spent.status === "loading" || previous.status === "loading") {
    return { label, value: null, tone: "neutral", accessibilityLabel: label };
  }
  if (spent.status === "error" || previous.status === "error") {
    return { label, value: DASH, tone: "neutral", accessibilityLabel: `${label}, not available` };
  }
  const result = compareSpend(spent.value, previous.value);
  switch (result.kind) {
    case "none":
      return {
        label,
        value: DASH,
        tone: "neutral",
        accessibilityLabel: `No spending in ${previousName} to compare with`,
      };
    case "same":
      return {
        label,
        value: "Same",
        tone: "neutral",
        accessibilityLabel: `Same as ${since}`,
      };
    case "more":
      return {
        label,
        value: `▲ ${money(result.deltaPaise)}`,
        tone: "danger",
        accessibilityLabel: `${money(result.deltaPaise)} more than ${since}`,
      };
    case "less":
      return {
        label,
        value: `▼ ${money(result.deltaPaise)}`,
        tone: "success",
        accessibilityLabel: `${money(result.deltaPaise)} less than ${since}`,
      };
  }
}

/** Everything the card shows, as text and flags, from the loaded pieces. */
export function buildCategoryMonthView(input: CategoryMonthViewInput): CategoryMonthView {
  const {
    month,
    now,
    cap,
    canSetCap,
    spentPaise,
    comparedPaise,
    comparable,
    todayPaise,
    payments,
    previousPaise,
  } = input;
  const clock = monthClock(month, now);

  const capPaise = cap.status === "ready" ? cap.value : null;
  const spentValue = spentPaise.status === "ready" ? spentPaise.value : null;
  const state = capPaise !== null && spentValue !== null ? capState(spentValue, capPaise) : null;

  let capView: CapView | null = null;
  if (cap.status === "loading") {
    capView = { state: "loading" };
  } else if (capPaise !== null) {
    if (state) {
      capView = {
        state: "ready",
        progress: state.progress,
        tone: state.tone,
        metaLine: state.metaLine,
      };
    } else if (spentPaise.status === "loading") {
      capView = { state: "loading" };
    } else {
      capView = { state: "ready", progress: 0, tone: "accent", metaLine: DASH };
    }
  }

  const pace =
    clock.daysRemaining !== null && state ? paceLine(state.leftPaise, clock.daysRemaining) : null;

  const primary: CardStat = clock.isCurrent
    ? { label: "Today", value: textOf(todayPaise, money) }
    : {
        label: "Avg/day",
        value: textOf(spentPaise, (paise) =>
          formatInrCompact(Math.round(paise / 100 / clock.daysInMonth)),
        ),
      };

  return {
    hero: textOf(spentPaise, money),
    over: state?.over ?? false,
    cap: capView,
    offerSetCap: canSetCap && cap.status === "ready" && capPaise === null,
    paceLine: pace,
    stats: {
      primary,
      payments: {
        label: "Payments",
        value: textOf(payments, ({ count, hasMore }) => `${count}${hasMore ? "+" : ""}`),
      },
      compare: buildCompare(month, now, comparedPaise, previousPaise, comparable),
    },
  };
}
