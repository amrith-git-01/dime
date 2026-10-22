import { localDate } from '../../core/timezone';

/** Small numeric helpers for the engine (plain arrays of numbers, no dependencies). */

export const DAY_MS = 86_400_000;

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Median absolute deviation. */
export function mad(values: readonly number[]): number {
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/** Coefficient of variation (population stdev / mean); 0 for an empty or all-zero list. */
export function cv(values: readonly number[]): number {
  const m = mean(values);
  if (m === 0) return 0;
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2))) / Math.abs(m);
}

/** Most common value (the smallest on ties); null for an empty list. */
export function mode<T extends number | string>(values: readonly T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [v, n] of counts) {
    if (n > bestCount || (n === bestCount && best !== null && v < best)) {
      best = v;
      bestCount = n;
    }
  }
  return best;
}

/** Days since 1970-01-01 of the calendar date (in `tz`) of an instant. */
export function dayNumber(tz: string, utcMs: number): number {
  const d = localDate(tz, utcMs);
  return Math.floor(Date.UTC(d.year, d.month - 1, d.day) / DAY_MS);
}

/** Days since 1970-01-01 of a calendar date (no timezone involved). */
export const dateN = (d: { year: number; month: number; day: number }): number => Math.floor(Date.UTC(d.year, d.month - 1, d.day) / DAY_MS);

/** 0 = Sunday ... 6 = Saturday, of a `dayNumber`. */
export const weekdayOf = (dayN: number): number => new Date(dayN * DAY_MS).getUTCDay();

/** Linear-interpolated percentile (`q` in 0..1) of an ascending-sorted list; 0 for an empty list. */
export function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = Math.min(1, Math.max(0, q)) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const a = sorted[lo] as number;
  const b = sorted[Math.ceil(pos)] as number;
  return a + (b - a) * (pos - lo);
}

/** Seeded PRNG (mulberry32): the same seed always gives the same stream of floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** FNV-1a hash of a string, to seed `mulberry32`. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
