import { toPaise } from "@/utils/paise";

import type { TransactionRow } from "../types";

/**
 * The Amount filter's slider scale, built from the month's expenses: positions are whole steps
 * (`index` 0 to `steps`) from `minPaise` to `maxPaise`, a round number of rupees apart. Any active
 * filter bound lies inside it (it may sit between two steps when it came from elsewhere).
 */
export type AmountDomain = {
  minPaise: number;
  maxPaise: number;
  stepPaise: number;
  /** Number of steps between the two ends; always at least 2. */
  steps: number;
};

/** Bounds as the list criteria carry them: null on a side the thumb leaves at the domain's end. */
export type AmountBounds = {
  amountMinPaise: number | null;
  amountMaxPaise: number | null;
};

const EPSILON = 1e-9;

/** The step, in paise, that suits a span of the given size: rupees 10 / 50 / 100 / 500. */
export function amountStepForSpan(spanPaise: number): number {
  const rupees = spanPaise / 100;
  if (rupees <= 1_000) return 1_000;
  if (rupees <= 10_000) return 5_000;
  if (rupees <= 100_000) return 10_000;
  return 50_000;
}

/**
 * The slider domain for the loaded rows: the smallest and largest debit (absolute amounts, credits
 * ignored), widened to contain any active bound so the thumbs can always show it, then the low end
 * rounded down and the high end rounded up to a step chosen for the final span. Null when there is
 * nothing to slide: no expenses, one amount, or fewer than two steps.
 */
export function buildAmountDomain(
  rows: readonly Pick<TransactionRow, "type" | "amount">[],
  activeBounds?: AmountBounds,
): AmountDomain | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const row of rows) {
    if (row.type !== "debit") continue;
    const paise = Math.abs(toPaise(row.amount));
    if (paise < lo) lo = paise;
    if (paise > hi) hi = paise;
  }
  if (!Number.isFinite(lo)) return null;
  for (const bound of [activeBounds?.amountMinPaise, activeBounds?.amountMaxPaise]) {
    if (bound === null || bound === undefined) continue;
    const paise = Math.max(0, bound);
    if (paise < lo) lo = paise;
    if (paise > hi) hi = paise;
  }
  if (lo >= hi) return null;
  const stepPaise = amountStepForSpan(hi - lo);
  const minPaise = Math.floor(lo / stepPaise) * stepPaise;
  const maxPaise = Math.ceil(hi / stepPaise) * stepPaise;
  const steps = (maxPaise - minPaise) / stepPaise;
  return steps >= 2 ? { minPaise, maxPaise, stepPaise, steps } : null;
}

/** The amount at a step index (clamped to the domain). */
export function amountAtIndex(domain: AmountDomain, index: number): number {
  const clamped = Math.max(0, Math.min(domain.steps, Math.round(index)));
  return domain.minPaise + clamped * domain.stepPaise;
}

/** The nearest step index for an amount (clamped to the domain). */
export function amountIndexOf(domain: AmountDomain, paise: number): number {
  const index = Math.round((paise - domain.minPaise) / domain.stepPaise);
  return Math.max(0, Math.min(domain.steps, index));
}

/**
 * The criteria bounds for two thumb values: a side at the domain's end is null (no bound), so the
 * full range means no filter. A value off the step grid is passed through untouched.
 */
export function amountBoundsFromValues(
  domain: AmountDomain,
  lowPaise: number,
  highPaise: number,
): AmountBounds {
  return {
    amountMinPaise: lowPaise <= domain.minPaise ? null : lowPaise,
    amountMaxPaise: highPaise >= domain.maxPaise ? null : highPaise,
  };
}

/**
 * Where the thumbs sit for the criteria's bounds, as the actual amounts: a missing bound is the
 * domain's end, and the thumbs are kept apart (a bound that crosses the other is pulled back).
 */
export function amountValuesFromBounds(
  domain: AmountDomain,
  bounds: AmountBounds,
): { low: number; high: number } {
  const clamp = (paise: number) => Math.max(domain.minPaise, Math.min(domain.maxPaise, paise));
  let low = bounds.amountMinPaise === null ? domain.minPaise : clamp(bounds.amountMinPaise);
  let high = bounds.amountMaxPaise === null ? domain.maxPaise : clamp(bounds.amountMaxPaise);
  if (low >= high) {
    if (high > domain.minPaise) low = Math.max(domain.minPaise, high - domain.stepPaise);
    else high = domain.minPaise + domain.stepPaise;
  }
  return { low, high };
}

/**
 * The step index a dragged thumb snaps to, at least one step from the other thumb (positions are
 * fractions of the domain, 0 to 1). Runs on the UI thread while dragging.
 */
export function snapThumbIndex(
  which: 0 | 1,
  frac: number,
  otherFrac: number,
  steps: number,
): number {
  "worklet";
  const gap = 1 / steps;
  const rounded = Math.round(frac * steps);
  if (which === 0) {
    const maxIndex = Math.max(0, Math.floor((otherFrac - gap) * steps + 1e-9));
    return Math.max(0, Math.min(rounded, maxIndex));
  }
  const minIndex = Math.min(steps, Math.ceil((otherFrac + gap) * steps - 1e-9));
  return Math.min(steps, Math.max(rounded, minIndex));
}

/**
 * One step on from a thumb (for screen-reader adjust): the next grid point in the direction, never
 * closer than a step to the other thumb. The other thumb keeps its exact value, and a thumb that
 * cannot move is returned as it was.
 */
export function nudgeAmountThumb(
  domain: AmountDomain,
  which: "low" | "high",
  lowPaise: number,
  highPaise: number,
  direction: 1 | -1,
): { low: number; high: number } {
  const slot = (paise: number) => (paise - domain.minPaise) / domain.stepPaise;
  const current = which === "low" ? lowPaise : highPaise;
  const s = slot(current);
  const target = direction > 0 ? Math.floor(s + EPSILON) + 1 : Math.ceil(s - EPSILON) - 1;
  let index: number;
  if (which === "low") {
    const maxIndex = Math.max(0, Math.floor(slot(highPaise) - 1 + EPSILON));
    index = Math.max(0, Math.min(target, maxIndex));
  } else {
    const minIndex = Math.min(domain.steps, Math.ceil(slot(lowPaise) + 1 - EPSILON));
    index = Math.min(domain.steps, Math.max(target, minIndex));
  }
  const next = domain.minPaise + index * domain.stepPaise;
  if ((direction > 0 && next <= current) || (direction < 0 && next >= current)) {
    return { low: lowPaise, high: highPaise };
  }
  return which === "low" ? { low: next, high: highPaise } : { low: lowPaise, high: next };
}
