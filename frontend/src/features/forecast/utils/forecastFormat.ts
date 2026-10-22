import { differenceInCalendarDays, format } from "date-fns";

import { formatInrCompact } from "@/utils/currency";

import type {
  ForecastCategory,
  ForecastLanding,
  ForecastUpcomingItem,
  ForecastWeekday,
} from "../types";

/** Rupees from an API decimal string; anything unreadable is 0. */
export function toRupees(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

const WEEKDAY_NAMES: Record<ForecastWeekday, string> = {
  Sun: "Sunday",
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
};

export function weekdayName(weekday: ForecastWeekday): string {
  return WEEKDAY_NAMES[weekday] ?? weekday;
}

/** "₹ 27,100 – ₹ 31,200": the same range as text, so it never depends on the band drawing. */
export function formatRangeText(p10: string, p90: string): string {
  return `${formatInrCompact(p10)} – ${formatInrCompact(p90)}`;
}

/** "71%" from a 0..1 share. */
export function formatChance(chanceUnder: number): string {
  return `${Math.round(chanceUnder * 100)}%`;
}

/** "within 6%": the previous month's error rounded up to a whole percent, at least 1. */
export function formatAccuracyWithin(errorPct: number): string {
  return `${Math.max(1, Math.ceil(errorPct))}%`;
}

/** `YYYY-MM-DD` as a local calendar date (no timezone shift). */
export function parseDayKey(key: string): Date {
  const [year = 0, month = 1, day = 1] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** "Today", "Tomorrow", else "Fri, 24 Oct", relative to the server's today. */
export function formatUpcomingDay(dateKey: string, todayKey: string): string {
  const date = parseDayKey(dateKey);
  const diff = differenceInCalendarDays(date, parseDayKey(todayKey));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return format(date, "EEE, d MMM");
}

export type UpcomingDayGroup = {
  date: string;
  label: string;
  items: ForecastUpcomingItem[];
};

/** The next-14-days list grouped by date, soonest first; the order within a day is the server's. */
export function groupUpcomingByDate(
  items: readonly ForecastUpcomingItem[],
  todayKey: string,
): UpcomingDayGroup[] {
  const sorted = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) =>
      a.item.date === b.item.date
        ? a.index - b.index
        : a.item.date < b.item.date
          ? -1
          : 1,
    );
  const groups: UpcomingDayGroup[] = [];
  for (const { item } of sorted) {
    const last = groups[groups.length - 1];
    if (last?.date === item.date) {
      last.items.push(item);
    } else {
      groups.push({
        date: item.date,
        label: formatUpcomingDay(item.date, todayKey),
        items: [item],
      });
    }
  }
  return groups;
}

/** 1-3 filled dots for a likely spend's confidence (0..1). */
export function confidenceDots(confidence: number | undefined): 1 | 2 | 3 {
  const c = confidence ?? 0;
  if (c >= 0.85) return 3;
  if (c >= 0.7) return 2;
  return 1;
}

export type BandLayout = {
  /** Fractions (0..1) along the track. */
  spent: number;
  bandStart: number;
  bandEnd: number;
  p50: number;
  budget: number | null;
};

/** The track runs a little past the highest figure so its end marker never touches the edge. */
const BAND_HEADROOM = 1.08;

/**
 * Where the pieces of the landing band sit on one track. The track starts at zero (the solid "spent" fill is drawn
 * from the left edge, so its length must be spent against the same scale as the budget and the range) and ends a
 * little past the highest figure.
 */
export function computeBandLayout(landing: ForecastLanding): BandLayout {
  const p10 = toRupees(landing.p10);
  const p50 = toRupees(landing.p50);
  const p90 = toRupees(landing.p90);
  const spent = toRupees(landing.spentSoFar);
  const budget = landing.budget === null ? null : toRupees(landing.budget);
  const hasBudget = budget !== null && budget > 0;

  const values = [p10, p50, p90, spent, ...(hasBudget ? [budget] : [])];
  const hi = Math.max(Math.max(...values) * BAND_HEADROOM, 1);
  const at = (value: number) => Math.min(1, Math.max(0, value / hi));

  return {
    spent: at(spent),
    bandStart: at(p10),
    bandEnd: at(p90),
    p50: at(p50),
    budget: hasBudget ? at(budget) : null,
  };
}

const STATUS_RANK = { over: 0, hot: 1, ok: 2 } as const;

/** Categories needing attention first (over, then hot), then by projected size. */
export function sortCategoriesAhead(
  categories: readonly ForecastCategory[],
): ForecastCategory[] {
  return [...categories].sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      toRupees(b.p50) - toRupees(a.p50),
  );
}

export type CategoryReference = {
  /** What the projection is measured against. */
  label: "budget" | "usual";
  amount: number;
};

/** The budget when the category has one, else its usual spend; null when it has neither. */
export function categoryReference(
  category: ForecastCategory,
): CategoryReference | null {
  const budget = toRupees(category.budget);
  if (category.budget !== null && budget > 0) {
    return { label: "budget", amount: budget };
  }
  const baseline = toRupees(category.baseline);
  if (category.baseline !== null && baseline > 0) {
    return { label: "usual", amount: baseline };
  }
  return null;
}
