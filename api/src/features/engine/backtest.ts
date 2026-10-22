import { monthRange, startOfLocalDay } from '../../core/timezone';
import { forecastLanding } from './forecast';
import type { Range } from './forecast';
import { dateN, dayNumber, hashSeed, mulberry32 } from './math';
import { buildProfile, isFlexibleSpend, monthFlexSums } from './patterns';
import type { EngineMode } from './patterns';
import type { EngineTxRow } from './types';

/**
 * Replaying the forecast as it would have been made on a past day, from the rows known then. Pure (no database): self-scoring
 * (`scoring.ts`) uses it to pick a baseline window, and `scripts/engine/backtest.ts` to report error and coverage. It runs the
 * same pieces as the live request (`buildProfile`, `monthFlexSums`, `forecastLanding`), so the two cannot drift apart.
 */

export interface AsOfOptions {
  /** Baseline window in days (the per-user tuning). */
  windowDays: number;
  /** Multiplier on the range (the per-user tuning). */
  widthFactor: number;
  rng: () => number;
  /** The user's oldest transaction, if older than `rows` reach; otherwise the oldest of the rows known at the time. */
  firstTransactionAt?: string | null;
}

export interface AsOfForecast extends Range {
  mode: EngineMode;
}

const monthKeyParts = (key: string) => {
  const [year = 0, month = 1, day = 1] = key.split('-').map(Number);
  return { year, month, day };
};

/**
 * The flexible spend still to come in the month that ends on `monthEndKey` (`YYYY-MM-DD`), as forecast at `asOfMs`: p10, p50
 * and p90 of the rest of that day plus the days after it. Rows after `asOfMs` are ignored, so nothing from the future leaks in.
 */
export function forecastFlexibleAsOf(rows: readonly EngineTxRow[], tz: string, asOfMs: number, monthEndKey: string, opts: AsOfOptions): AsOfForecast {
  const known = rows.filter((r) => Date.parse(r.transaction_at) <= asOfMs);
  const end = monthKeyParts(monthEndKey);
  const oldest = known.reduce<string | null>((a, r) => (a === null || r.transaction_at < a ? r.transaction_at : a), null);
  const profile = buildProfile({
    rows: known,
    firstTransactionAt: opts.firstTransactionAt ?? oldest,
    incomeItems: [],
    cadences: [],
    tz,
    nowMs: asOfMs,
    windowDays: opts.windowDays,
    widthFactor: opts.widthFactor,
  });
  const todayN = dayNumber(tz, asOfMs);
  const sums = monthFlexSums(known, tz, monthRange(tz, end.year, end.month), todayN);
  const result = forecastLanding({
    profile,
    todayN,
    monthStartN: dateN({ year: end.year, month: end.month, day: 1 }),
    monthEndN: dateN(end),
    spentSoFar: 0,
    flexibleSpentSoFar: sums.flexibleSpentSoFar,
    flexibleSpentToday: sums.flexibleSpentToday,
    billsStillDue: 0,
    budget: null,
    rng: opts.rng,
  });
  return { ...result.flexibleRemaining, mode: profile.mode };
}

/** One replayed forecast day, with what then happened. Paise. */
export interface ReplayPoint {
  day: number;
  mode: EngineMode;
  /** The forecast flexible spend still to come, and what was actually spent on flexible things after the as-of instant. */
  flexible: Range;
  actualFlexibleRemaining: number;
  /** Month-end landing = debits so far + the month's bills after the as-of instant (known to code from the recurring items) + `flexible`. */
  landing: Range;
  /** Every debit of the month (the definition the month summary and the snapshots use). */
  actualTotal: number;
}

export interface ReplayOptions {
  windowDays: number;
  widthFactor: number;
  /** Seeds the random draws, so a replay gives the same numbers every time. */
  seed: string;
  firstTransactionAt?: string | null;
}

/**
 * Forecasts the month on each of `days` (day of month) as it would have been at the start of that local day, and sets it against
 * what happened. `rows` must reach back far enough for the window and through the month's end. The month's bills are taken from
 * the rows themselves (debits posted by a recurring item), as if the recurring items had been known: this isolates the
 * flexible part, which is the part the engine learns.
 */
export function replayMonth(rows: readonly EngineTxRow[], tz: string, year: number, month: number, days: readonly number[], opts: ReplayOptions): ReplayPoint[] {
  const range = monthRange(tz, year, month);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const inMonth = rows.filter((r) => r.transaction_at >= range.from && r.transaction_at < range.to);
  const actualTotal = inMonth.filter((r) => r.type === 'debit').reduce((a, r) => a + r.amount, 0);
  const monthEndKey = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  return days
    .filter((day) => day >= 1 && day <= daysInMonth)
    .map((day) => {
      const asOfMs = startOfLocalDay(tz, { year, month, day });
      const forecast = forecastFlexibleAsOf(rows, tz, asOfMs, monthEndKey, {
        windowDays: opts.windowDays,
        widthFactor: opts.widthFactor,
        rng: mulberry32(hashSeed(`${opts.seed}:${year}-${month}:${day}:${opts.windowDays}`)),
        firstTransactionAt: opts.firstTransactionAt ?? null,
      });
      let spentBefore = 0;
      let billsAfter = 0;
      let flexibleAfter = 0;
      for (const r of inMonth) {
        if (r.type !== 'debit') continue;
        if (Date.parse(r.transaction_at) <= asOfMs) spentBefore += r.amount;
        else {
          if (r.recurring_item_id !== null) billsAfter += r.amount;
          if (isFlexibleSpend(r)) flexibleAfter += r.amount;
        }
      }
      const base = spentBefore + billsAfter;
      return {
        day,
        mode: forecast.mode,
        flexible: { p10: forecast.p10, p50: forecast.p50, p90: forecast.p90 },
        actualFlexibleRemaining: flexibleAfter,
        landing: { p10: base + forecast.p10, p50: base + forecast.p50, p90: base + forecast.p90 },
        actualTotal,
      };
    });
}
