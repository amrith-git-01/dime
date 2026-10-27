import { formatInrCompact } from "@/utils/currency";

import { isReportPeriodKey } from "./periodKey";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function monthName(month: number): string {
  return MONTH_NAMES[Math.min(11, Math.max(0, Math.trunc(month) - 1))] ?? "";
}

export function monthShort(month: number): string {
  return monthName(month).slice(0, 3);
}

/** `index` 0 = Monday (the snapshot's weekday order). */
export function weekdayName(index: number): string {
  return WEEKDAY_NAMES[Math.min(6, Math.max(0, Math.trunc(index)))] ?? "";
}

export function weekdayShort(index: number): string {
  return WEEKDAY_SHORT[Math.min(6, Math.max(0, Math.trunc(index)))] ?? "";
}

export function parseAmount(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

/** `186` tenths -> "18.6", `180` -> "18". */
function tenthsLabel(tenths: number): string {
  return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
}

/**
 * Hero-sized rupees: ₹950, ₹18.6k, ₹1.2L, ₹2.4Cr. Whole rupees below a thousand; the sign is dropped
 * (the report talks in magnitudes). Full values for screen readers use `formatFullAmount`.
 */
export function formatReportAmount(value: string | number | null | undefined): string {
  const n = Math.abs(parseAmount(value));
  const rupees = Math.round(n);
  if (rupees < 1000) {
    return `₹${rupees}`;
  }
  const thousands = Math.round(n / 100);
  if (thousands < 1000) {
    return `₹${tenthsLabel(thousands)}k`;
  }
  const lakhs = Math.round(n / 10_000);
  if (lakhs < 1000) {
    return `₹${tenthsLabel(lakhs)}L`;
  }
  return `₹${tenthsLabel(Math.round(n / 1_000_000))}Cr`;
}

/** Whole rupees with Indian grouping, for accessibility labels ("₹ 18,620"). */
export function formatFullAmount(value: string | number | null | undefined): string {
  return formatInrCompact(Math.abs(parseAmount(value)));
}

export function formatPercent(share: number): string {
  const n = Number.isFinite(share) ? share : 0;
  return `${Math.round(Math.min(1, Math.max(0, n)) * 100)}%`;
}

/** `2026-10-14` -> "14 Oct" (no timezone maths: the snapshot already holds the IST day). */
export function formatDayMonth(isoDay: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDay ?? "");
  if (!match) {
    return "";
  }
  return `${Number(match[3])} ${monthShort(Number(match[2]))}`;
}

export function periodLabel(year: number, month: number): string {
  return `${monthName(month)} ${year}`;
}

/** `{ year, month }` of a `YYYY-MM` key, or null when it is not one. */
export function parsePeriodKey(
  periodKey: string,
): { year: number; month: number } | null {
  if (!isReportPeriodKey(periodKey)) {
    return null;
  }
  return { year: Number(periodKey.slice(0, 4)), month: Number(periodKey.slice(5, 7)) };
}

export function toPeriodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The calendar day in India (reports are built in IST), whatever the device timezone is. */
export function istParts(now: Date): { year: number; month: number; day: number } {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** The `YYYY-MM` before `{ year, month }`. */
export function previousPeriodKey(year: number, month: number): string {
  return month === 1 ? toPeriodKey(year - 1, 12) : toPeriodKey(year, month - 1);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Milliseconds until the next midnight in India (when the IST calendar day changes). */
export function msUntilNextIstDay(now: Date): number {
  return DAY_MS - ((now.getTime() + IST_OFFSET_MS) % DAY_MS);
}
