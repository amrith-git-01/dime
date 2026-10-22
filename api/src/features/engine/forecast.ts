import { percentile, weekdayOf } from './math';
import type { EngineProfile } from './patterns';

/** Draws per forecast: milliseconds of maths for a month, and a p10..p90 band that does not wobble. */
export const DRAWS = 1000;
/** Recent weeks weigh more: a weekday value half as old as another counts twice as much. */
const HALF_LIFE_DAYS = 30;
/** Fewer samples than this on a weekday: its days are drawn from all days instead. */
const MIN_WEEKDAY_SAMPLES = 2;
/** Ranges widen by this much while the history is still short. */
const WARMING_WIDEN = 1.5;
/** Learning mode (no weekday profile yet): the flexible part is +-20%. */
const LEARNING_SPREAD = 0.2;

/** Running hot: the flexible projection is this far above the category's usual, and by at least `HOT_MIN_EXCESS`. */
export const HOT_RATIO = 1.25;
/** Paise (Rs 500). */
export const HOT_MIN_EXCESS = 50_000;

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Paise. */
export interface Range {
  p10: number;
  p50: number;
  p90: number;
}

export type ForecastProfile = Pick<EngineProfile, 'weekday' | 'overallDailyMedian' | 'mode' | 'widthFactor' | 'historyDays'>;

export interface ForecastInput {
  profile: ForecastProfile;
  /** `dayNumber` of today and of the first and last day of the month (in the user's timezone). */
  todayN: number;
  monthStartN: number;
  monthEndN: number;
  /** Every debit so far this month (fixed and flexible), paise: the total the month summary shows. */
  spentSoFar: number;
  /** The flexible part of it (the profile's definition), so far this month and today. */
  flexibleSpentSoFar: number;
  flexibleSpentToday: number;
  /** Active recurring bills that have not posted yet this month. */
  billsStillDue: number;
  /** Monthly budget in paise; null = none. */
  budget: number | null;
  /** Injected so tests (and the per-day seed) make results repeatable. */
  rng: () => number;
}

export interface ForecastResult {
  landing: Range;
  /** The flexible spend still to come this month (the rest of today plus the days after it). */
  flexibleRemaining: Range;
  /** Share of draws that land at or under the budget; null without a budget. */
  chanceUnder: number | null;
}

interface Sampler {
  values: readonly number[];
  cumulative: number[];
}

/** Weighted sampler over `values`, oldest first: weights halve every `HALF_LIFE_DAYS` (weekday values are 7 days apart). */
function recencySampler(values: readonly number[]): Sampler {
  const n = values.length;
  let total = 0;
  return { values, cumulative: values.map((_, i) => (total += 0.5 ** (((n - 1 - i) * 7) / HALF_LIFE_DAYS))) };
}

function pick(s: Sampler, rng: () => number): number {
  const r = rng() * (s.cumulative[s.cumulative.length - 1] as number);
  let lo = 0;
  let hi = s.values.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((s.cumulative[mid] as number) > r) hi = mid;
    else lo = mid + 1;
  }
  return s.values[lo] as number;
}

const hasWeekdayHistory = (profile: ForecastProfile, weekday: number) => (profile.weekday[weekday]?.values.length ?? 0) >= MIN_WEEKDAY_SAMPLES;

/** The usual flexible spend of a weekday; the overall daily median when the weekday has too few samples. */
export function weekdayUsual(profile: ForecastProfile, weekday: number): number {
  return hasWeekdayHistory(profile, weekday) ? (profile.weekday[weekday] as { median: number }).median : profile.overallDailyMedian;
}

/** P(landing <= budget) from the three quantiles alone (learning mode has no draws): straight lines through them, clamped. */
function chanceFromRange(r: Range, budget: number): number {
  if (r.p90 <= r.p10) return budget >= r.p50 ? 1 : 0;
  const slope = budget <= r.p50 ? 0.4 / (r.p50 - r.p10 || 1) : 0.4 / (r.p90 - r.p50 || 1);
  const p = 0.5 + (budget - r.p50) * slope;
  return Math.min(1, Math.max(0, p));
}

/**
 * Month-end landing = spent so far + bills still due + flexible spend still to come (docs/PREDICTIVE-ENGINE-PLAN.md §5.2).
 * The flexible part is resampled: each remaining day is drawn from the same weekday's history (recent weeks weigh more),
 * `DRAWS` times; the rest of today is the weekday's usual minus what was already spent today. Deviations from the median
 * scale with the user's `widthFactor` (and 1.5x while warming). With under two weeks of history there is no weekday
 * profile: the flexible part is this month's daily rate carried forward, +-20%.
 */
export function forecastLanding(input: ForecastInput): ForecastResult {
  const { profile, budget } = input;
  const base = input.spentSoFar + input.billsStillDue;
  const widen = (profile.widthFactor || 1) * (profile.mode === 'warming' ? WARMING_WIDEN : 1);

  if (profile.mode === 'learning') {
    // Only days the user has existed count (a user who started 5 days ago did not skip the first 17 days of the month).
    const elapsed = Math.max(1, Math.min(input.todayN - input.monthStartN + 1, profile.historyDays + 1));
    // The rest of today counts too: a full day at the daily rate, less what was already spent today.
    const flexible = Math.max(0, Math.round((input.flexibleSpentSoFar / elapsed) * (input.monthEndN - input.todayN + 1) - input.flexibleSpentToday));
    const spread = LEARNING_SPREAD * widen;
    const flexibleRemaining = { p10: Math.round(flexible * (1 - spread)), p50: flexible, p90: Math.round(flexible * (1 + spread)) };
    const landing = { p10: base + flexibleRemaining.p10, p50: base + flexible, p90: base + flexibleRemaining.p90 };
    return { landing, flexibleRemaining, chanceUnder: budget === null ? null : chanceFromRange(landing, budget) };
  }

  const all = profile.weekday.flatMap((w) => w.values);
  const pool = all.length > 0 ? { values: all, cumulative: all.map((_, i) => i + 1) } : null;
  const samplers = profile.weekday.map((w, weekday) => (hasWeekdayHistory(profile, weekday) ? recencySampler(w.values) : pool));
  const days: Sampler[] = [];
  for (let n = input.todayN + 1; n <= input.monthEndN; n++) {
    const sampler = samplers[weekdayOf(n)];
    if (sampler) days.push(sampler);
  }
  const restOfToday = Math.max(0, weekdayUsual(profile, weekdayOf(input.todayN)) - input.flexibleSpentToday);

  const draws: number[] = [];
  for (let i = 0; i < DRAWS; i++) {
    let sum = 0;
    for (const day of days) sum += pick(day, input.rng);
    draws.push(sum);
  }
  draws.sort((a, b) => a - b);
  const centre = percentile(draws, 0.5);
  const spreadDraws = widen === 1 ? draws : draws.map((d) => Math.max(0, centre + (d - centre) * widen));

  const flexibleRemaining = {
    p10: Math.round(restOfToday + percentile(spreadDraws, 0.1)),
    p50: Math.round(restOfToday + percentile(spreadDraws, 0.5)),
    p90: Math.round(restOfToday + percentile(spreadDraws, 0.9)),
  };
  const landing = {
    p10: base + flexibleRemaining.p10,
    p50: base + flexibleRemaining.p50,
    p90: base + flexibleRemaining.p90,
  };
  let under = 0;
  if (budget !== null) for (const d of spreadDraws) if (base + restOfToday + d <= budget) under++;
  return { landing, flexibleRemaining, chanceUnder: budget === null ? null : under / spreadDraws.length };
}

export interface SafeTodayInput {
  profile: ForecastProfile;
  todayN: number;
  monthEndN: number;
  spentSoFar: number;
  /** Every debit today (it is part of `spentSoFar`). */
  spentToday: number;
  billsStillDue: number;
  budget: number | null;
}

/**
 * What can still be spent today (docs/PREDICTIVE-ENGINE-PLAN.md §5.3): the budget that was left after bills at the start
 * of today, shared over today and the days after it by weekday weight (heavy days get more), less what was already spent
 * today. `amount` is null without a budget; `usual` is the weekday's usual flexible spend, shown instead.
 */
export function safeToday(input: SafeTodayInput): { amount: number | null; usual: number; weekday: (typeof WEEKDAY_NAMES)[number] } {
  const { profile, todayN } = input;
  const weekday = weekdayOf(todayN);
  const usual = Math.round(weekdayUsual(profile, weekday));
  const name = WEEKDAY_NAMES[weekday] as (typeof WEEKDAY_NAMES)[number];
  if (input.budget === null) return { amount: null, usual, weekday: name };

  const leftAtStart = Math.max(0, input.budget - (input.spentSoFar - input.spentToday) - input.billsStillDue);
  const weights: number[] = [];
  for (let n = todayN; n <= input.monthEndN; n++) weights.push(weekdayUsual(profile, weekdayOf(n)));
  const total = weights.reduce((a, b) => a + b, 0);
  const share = total > 0 ? (weights[0] as number) / total : 1 / weights.length;
  return { amount: Math.max(0, Math.round(leftAtStart * share - input.spentToday)), usual, weekday: name };
}

export interface CategoryInput {
  /** Category id; null = uncategorized. */
  id: string | null;
  /** Every debit in the category so far this month. */
  spent: number;
  /** The flexible part of it. */
  flexSpent: number;
  /** Bills of this category still due this month. */
  billsDue: number;
  /** Usual monthly flexible spend (the profile's median); null = no history. */
  baseline: number | null;
  /** Category budget, paise; null = none. */
  budget: number | null;
  /** The category's share (0..1) of the user's flexible spend. */
  share: number;
  /**
   * The category's own usual flexible spend for the rest of the month (`categoryRestOfMonth`), paise. When set it replaces
   * the share of the flexible projection; null/absent = too little history, use the share.
   */
  restOfMonth?: number | null;
}

export type CategoryStatus = 'ok' | 'hot' | 'over';

export interface CategoryOutlook {
  id: string | null;
  spent: number;
  p50: number;
  budget: number | null;
  baseline: number | null;
  status: CategoryStatus;
}

/**
 * A category's month-end p50 = spent + bills still due + the flexible spend still to come. That is the category's own usual
 * for the rest of the month when known (a monthly payee that has paid already adds nothing), otherwise its share of the
 * flexible remainder. It is `over` when that passes the category budget, `hot` when its flexible part is above the usual by
 * `HOT_RATIO` and `HOT_MIN_EXCESS`. `flexibleRemainingP50` is 0 for a month that is over.
 */
export function categoryOutlook(c: CategoryInput, flexibleRemainingP50: number): CategoryOutlook {
  const flexTail = c.restOfMonth ?? c.share * flexibleRemainingP50;
  const p50 = Math.round(c.spent + c.billsDue + flexTail);
  const flexP50 = c.flexSpent + flexTail;
  let status: CategoryStatus = 'ok';
  if (c.budget !== null && p50 > c.budget) status = 'over';
  else if (c.baseline !== null && c.baseline > 0 && flexP50 >= HOT_RATIO * c.baseline && flexP50 - c.baseline >= HOT_MIN_EXCESS) status = 'hot';
  return { id: c.id, spent: c.spent, p50, budget: c.budget, baseline: c.baseline, status };
}

/**
 * Each category's share of the user's flexible spend: from the baseline months when there are any, otherwise from this
 * month so far. Keys are category ids (`UNCATEGORIZED_KEY` for none).
 */
export function flexibleShares(profile: Pick<EngineProfile, 'categories'>, monthFlexByCategory: ReadonlyMap<string, number>): Map<string, number> {
  const totals = new Map<string, number>();
  for (const [id, b] of Object.entries(profile.categories)) totals.set(id.toLowerCase(), b.monthlyTotals.reduce((a, c) => a + c, 0));
  let sum = [...totals.values()].reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    totals.clear();
    for (const [id, v] of monthFlexByCategory) totals.set(id.toLowerCase(), v);
    sum = [...totals.values()].reduce((a, b) => a + b, 0);
  }
  return new Map([...totals].map(([id, v]) => [id, sum > 0 ? v / sum : 0]));
}
