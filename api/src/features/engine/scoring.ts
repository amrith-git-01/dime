import { all, first, run } from '../../core/db';
import type { Db } from '../../core/db';
import type { Bindings } from '../../core/env';
import { log } from '../../core/logging';
import { addDays, localDate, monthRange, startOfLocalDay } from '../../core/timezone';
import type { LocalDate } from '../../core/timezone';
import { periodSummary } from '../transactions/repository';
import { replayMonth } from './backtest';
import { runEngineForUser } from './job';
import { median } from './math';
import { loadEngineRowsBetween, loadFirstTransactionAt, resolveTimezone, spentCents } from './patterns';
import { currentLanding } from './service';

/**
 * Self-scoring (docs/PREDICTIVE-ENGINE-PLAN.md §6.2). The nightly job saves the forecast as it stood on a few days of the
 * month, fills in what was actually spent once the month is over, and nudges two per-user knobs from the result: how wide the
 * range is (`width_factor`) and how many days of history the baselines use (`window_days`).
 */

/** Days of the month (in the user's timezone) the forecast is saved on. */
export const SNAPSHOT_DAYS: readonly number[] = [1, 7, 14, 21];
const METHOD = 'stats';

/**
 * The nightly fan-out queues every active user around a snapshot day: a user in another timezone is on a different local day
 * than the Asia/Kolkata date the cron sees, so the IST day before and after count too. The job decides by the user's own day.
 */
export const nearSnapshotDay = (istToday: LocalDate): boolean => [-1, 0, 1].some((offset) => SNAPSHOT_DAYS.includes(addDays(istToday, offset).day));

/** Tuning waits for this many scored months; the width also needs this many scored snapshots (of the last `TUNING_MONTHS` months) made with the width in force. */
export const MIN_SCORED_MONTHS = 2;
export const MIN_SNAPSHOTS_AT_WIDTH = 4;
const TUNING_MONTHS = 3;
/** Share of actuals inside p10..p90: under `COVERAGE_LOW` the range is too narrow, over `COVERAGE_HIGH` (with a small error) too wide. */
const COVERAGE_LOW = 0.7;
const COVERAGE_HIGH = 0.9;
/** "A narrow error": the median |p50 - actual| / actual is at most this. */
const NARROW_ERROR = 0.1;
const WIDEN = 1.1;
const NARROW = 0.95;
export const WIDTH_MIN = 0.6;
export const WIDTH_MAX = 2.5;
/** Baseline windows (days) the replay chooses from, and the days of the previous month it replays. */
export const WINDOWS: readonly number[] = [60, 90, 120];
const REPLAY_DAYS: readonly number[] = [7, 14, 21];
/** The snapshot that stands for a month in the accuracy report: a month without one is not reported. */
const REPORT_DAY = 14;

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;
const parseMonth = (key: string) => ({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) });
const round3 = (n: number) => Math.round(n * 1000) / 1000;

interface ScoredSnapshot {
  month: string;
  day: number;
  p10: number;
  p50: number;
  p90: number;
  actual: number;
}

/**
 * Snapshots of the user's last `months` scored months (a month without any spending is not scored: there is nothing to be
 * wrong about). With `width`, only those made with that `width_factor`.
 */
async function scoredSnapshots(db: Db, userId: string, months: number, width?: number): Promise<ScoredSnapshot[]> {
  return all<ScoredSnapshot>(
    db,
    `SELECT month, day, p10, p50, p90, actual FROM forecast_snapshots
     WHERE user_id = ?1 AND method = ?2 AND actual > 0 AND (?4 IS NULL OR ABS(width_factor - ?4) < 0.0005)
       AND month IN (SELECT DISTINCT month FROM forecast_snapshots WHERE user_id = ?1 AND method = ?2 AND actual > 0 ORDER BY month DESC LIMIT ?3)
     ORDER BY month DESC, day`,
    [userId, METHOD, months, width ?? null],
  );
}

const errorOf = (s: ScoredSnapshot) => Math.abs(s.p50 - s.actual) / s.actual;
const coveredBy = (s: ScoredSnapshot) => s.p10 <= s.actual && s.actual <= s.p90;

export interface AccuracyMonth {
  year: number;
  month: number;
  /** `|p50 - actual| / actual` as a percentage with one decimal, of the day-14 snapshot. */
  errorPct: number;
  /** Whether the actual fell inside that snapshot's p10..p90. */
  covered: boolean;
}

/** The last three scored months that have a day-14 snapshot, newest first (`GET /forecast/accuracy`, and the forecast's `accuracy` line). */
export async function loadAccuracy(db: Db, userId: string): Promise<AccuracyMonth[]> {
  const rows = await all<ScoredSnapshot>(
    db,
    `SELECT month, day, p10, p50, p90, actual FROM forecast_snapshots
     WHERE user_id = ? AND method = ? AND day = ? AND actual > 0 ORDER BY month DESC LIMIT ?`,
    [userId, METHOD, REPORT_DAY, TUNING_MONTHS],
  );
  return rows.map((s) => ({ ...parseMonth(s.month), errorPct: Math.round(errorOf(s) * 1000) / 10, covered: coveredBy(s) }));
}

/**
 * The new `width_factor` from the last scored months, or null when it should stay. Only snapshots made with the width now in
 * force are judged (a width that was just changed has not been tried yet), and it takes `MIN_SNAPSHOTS_AT_WIDTH` of them, so
 * the width cannot overshoot. Wider when too few actuals were inside the range; narrower when
 * nearly all were and the middle was close.
 */
export async function tunedWidth(db: Db, userId: string, current: number): Promise<number | null> {
  const snapshots = await scoredSnapshots(db, userId, TUNING_MONTHS, current);
  if (snapshots.length < MIN_SNAPSHOTS_AT_WIDTH) return null;
  const coverage = snapshots.filter(coveredBy).length / snapshots.length;
  let next = current;
  if (coverage < COVERAGE_LOW) next = Math.min(WIDTH_MAX, current * WIDEN);
  else if (coverage > COVERAGE_HIGH && median(snapshots.map(errorOf)) <= NARROW_ERROR) next = Math.max(WIDTH_MIN, current * NARROW);
  next = round3(next);
  return next === current ? null : next;
}

/**
 * The baseline window that would have forecast the given (finished) month best: replays days 7, 14 and 21 of it for each window
 * and keeps the lowest mean absolute % error of the flexible spend still to come. A tie keeps the current window. Null when
 * there is nothing to judge by (a month or history too short to leave learning mode, or no flexible spend after the as-of days).
 */
export async function tunedWindow(db: Db, userId: string, tz: string, month: string, currentWindow: number, widthFactor: number): Promise<number | null> {
  const { year, month: m } = parseMonth(month);
  const range = monthRange(tz, year, m);
  const maxWindow = Math.max(...WINDOWS);
  const fromMs = startOfLocalDay(tz, addDays({ year, month: m, day: 1 }, -maxWindow));
  const [rows, firstTransactionAt] = await Promise.all([loadEngineRowsBetween(db, userId, fromMs, Date.parse(range.to) - 1), loadFirstTransactionAt(db, userId)]);

  const mape = (windowDays: number): number | null => {
    const errors = replayMonth(rows, tz, year, m, REPLAY_DAYS, { windowDays, widthFactor, seed: userId, firstTransactionAt })
      .filter((p) => p.mode !== 'learning' && p.actualFlexibleRemaining > 0)
      .map((p) => Math.abs(p.flexible.p50 - p.actualFlexibleRemaining) / p.actualFlexibleRemaining);
    return errors.length === 0 ? null : errors.reduce((a, b) => a + b, 0) / errors.length;
  };
  let best = currentWindow;
  let bestError = mape(currentWindow);
  if (bestError === null) return null;
  for (const windowDays of WINDOWS) {
    if (windowDays === currentWindow) continue;
    const error = mape(windowDays);
    if (error !== null && error < bestError) {
      best = windowDays;
      bestError = error;
    }
  }
  return best === currentWindow ? null : best;
}

export interface ScoringResult {
  status: 'done' | 'failed';
  /** Months whose snapshots were filled with the actual spend. */
  scored: number;
  /** The stored tuning changed (the profile was rebuilt with it). */
  tuned: boolean;
  /** A snapshot was saved today. */
  snapshot: boolean;
}

/**
 * The scoring step of a user's nightly job, after their rows were rebuilt. Any finished month that still has snapshots without an
 * `actual` gets it now (`spentCents`, the debit total the forecast's `spentSoFar` uses). The tuning of `width_factor` and
 * `window_days` runs whenever the latest finished month with actuals is newer than `last_tuned_month`, so a night that failed
 * after scoring tunes on the next one; a changed tuning rebuilds the profile. On the snapshot days (1, 7, 14, 21 of the user's
 * local month) it then saves today's landing range with the tuning in force. Never throws: a failure is logged and the next
 * night tries again.
 */
export async function runScoring(env: Pick<Bindings, 'DB'>, userId: string, nowMs: number): Promise<ScoringResult> {
  const out: ScoringResult = { status: 'done', scored: 0, tuned: false, snapshot: false };
  try {
    const db = env.DB;
    const tz = await resolveTimezone(db, userId);
    const today = localDate(tz, nowMs);
    const thisMonth = monthKey(today.year, today.month);

    const finished = await all<{ month: string }>(
      db,
      'SELECT DISTINCT month FROM forecast_snapshots WHERE user_id = ? AND method = ? AND actual IS NULL AND month < ? ORDER BY month',
      [userId, METHOD, thisMonth],
    );
    for (const { month } of finished) {
      const { year, month: m } = parseMonth(month);
      const actual = spentCents(await periodSummary(db, userId, monthRange(tz, year, m)));
      await run(db, 'UPDATE forecast_snapshots SET actual = ? WHERE user_id = ? AND month = ? AND method = ? AND actual IS NULL', [actual, userId, month, METHOD]);
      out.scored += 1;
    }

    const state = await first<{ width_factor: number; window_days: number; last_tuned_month: string | null }>(
      db,
      'SELECT width_factor, window_days, last_tuned_month FROM engine_patterns WHERE user_id = ?',
      [userId],
    );
    if (state) {
      const latest = (
        await first<{ month: string | null }>(
          db,
          'SELECT MAX(month) AS month FROM forecast_snapshots WHERE user_id = ? AND method = ? AND actual IS NOT NULL AND month < ?',
          [userId, METHOD, thisMonth],
        )
      )?.month;
      if (latest && (state.last_tuned_month === null || latest > state.last_tuned_month)) {
        let width = state.width_factor;
        let windowDays = state.window_days;
        if ((await scoredMonths(db, userId)) >= MIN_SCORED_MONTHS) {
          width = (await tunedWidth(db, userId, width)) ?? width;
          windowDays = (await tunedWindow(db, userId, tz, latest, windowDays, width)) ?? windowDays;
        }
        await run(db, 'UPDATE engine_patterns SET width_factor = ?, window_days = ?, last_tuned_month = ? WHERE user_id = ?', [width, windowDays, latest, userId]);
        if (width !== state.width_factor || windowDays !== state.window_days) {
          await runEngineForUser(env, userId, nowMs);
          out.tuned = true;
        }
      }
    }

    if (SNAPSHOT_DAYS.includes(today.day)) {
      const now = await currentLanding(db, userId, tz, nowMs);
      if (now) {
        const tuning = await first<{ width_factor: number; window_days: number }>(db, 'SELECT width_factor, window_days FROM engine_patterns WHERE user_id = ?', [userId]);
        await run(
          db,
          'INSERT OR IGNORE INTO forecast_snapshots (user_id, month, day, method, p10, p50, p90, width_factor, window_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [userId, monthKey(now.year, now.month), now.day, METHOD, now.landing.p10, now.landing.p50, now.landing.p90, tuning?.width_factor ?? 1, tuning?.window_days ?? 90],
        );
        out.snapshot = true;
      }
    }
  } catch (err) {
    log.warn('engine_scoring_failed', { userId, err: String(err) });
    out.status = 'failed';
  }
  return out;
}

async function scoredMonths(db: Db, userId: string): Promise<number> {
  return new Set((await scoredSnapshots(db, userId, TUNING_MONTHS)).map((s) => s.month)).size;
}
