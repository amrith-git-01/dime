import { all, first, run } from '../../core/db';
import type { Db } from '../../core/db';
import { decimalToCents, formatCents } from '../../core/decimal';
import { ValidationError } from '../../core/errors';
import { log } from '../../core/logging';
import { dateKey, localDate, monthRange, parseTimezone } from '../../core/timezone';
import { fetchBudget, listCategoryBudgets } from '../budgets/repository';
import { fetchMetaByIds } from '../categories/repository';
import * as recurringRepo from '../recurring/repository';
import { UNCATEGORIZED_KEY } from '../transactions/aggregates';
import { periodSummary } from '../transactions/repository';
import { copyKey, parseStoredCopy, pastMonthText, renderTemplate, summaryTarget, summaryText } from './copy';
import type { CopyTargets, SummaryInput } from './copy';
import { categoryOutlook, flexibleShares, forecastLanding, safeToday } from './forecast';
import type { CategoryOutlook, Range } from './forecast';
import { runEngineForUser } from './job';
import { dateN, dayNumber, hashSeed, mulberry32 } from './math';
import { HISTORY_CAP_DAYS, PROFILE_VERSION, categoryRestOfMonth, spentCents, loadEngineRows, loadFirstTransactionAt, modeForHistory, monthFlexSums } from './patterns';
import type { EngineProfile } from './patterns';
import { loadAccuracy } from './scoring';
import type { AccuracyMonth } from './scoring';
import type { ForecastCategory, ForecastResponse, ForecastUpcomingItem, ForecastWatchItem } from './schemas';
import { billsStillDue, buildUpcoming } from './upcoming';
import { buildWatch } from './watch';
import type { EngineTxRow, PayeePatternRow } from './types';

/** A dirty profile is rebuilt on request only when it is older than this (the nightly job refreshes it anyway). */
const STALE_MS = 15 * 60_000;
/** A new request timezone replaces the stored one only when that was set longer ago than this. */
const TIMEZONE_HOLD_MS = 6 * 3_600_000;
const MAX_CATEGORIES = 20;

interface StoredProfile {
  version: number;
  profile: string;
  dirty: number;
  computed_at: string;
  timezone: string | null;
  timezone_at: string | null;
}

const readStored = (db: Db, userId: string) =>
  first<StoredProfile>(db, 'SELECT version, profile, dirty, computed_at, timezone, timezone_at FROM engine_patterns WHERE user_id = ?', [userId]);

function parseProfile(row: StoredProfile | null): EngineProfile | null {
  if (!row || row.version !== PROFILE_VERSION) return null; // no row yet, a stub made by the dirty mark, or an older format
  try {
    return JSON.parse(row.profile) as EngineProfile;
  } catch {
    return null;
  }
}

/**
 * Remembers the timezone the app asked in as the user's engine timezone, so the nightly job cuts days the same way.
 * One write, and only when it differs. Never throws; false when it could not be saved.
 */
async function saveTimezone(db: Db, userId: string, tz: string, nowMs: number): Promise<boolean> {
  try {
    await run(
      db,
      `INSERT INTO engine_patterns (user_id, version, history_days, profile, dirty, dirty_seq, computed_at, timezone, timezone_at)
       VALUES (?1, 0, 0, '{}', 1, 1, '1970-01-01T00:00:00.000Z', ?2, ?3)
       ON CONFLICT (user_id) DO UPDATE SET timezone = excluded.timezone, timezone_at = excluded.timezone_at WHERE engine_patterns.timezone IS NOT excluded.timezone`,
      [userId, tz, new Date(nowMs).toISOString()],
    );
    return true;
  } catch (err) {
    log.warn('engine_save_timezone_failed', { userId, err });
    return false;
  }
}

/**
 * The user's stored profile, rebuilt first (without the LLM step) when there is none, when it was built for another
 * timezone, or when a transaction write marked it dirty more than 15 minutes ago. A failed rebuild falls back to the
 * last good profile. A timezone that differs from the stored one is adopted only when the stored one is unset or was
 * set over 6 hours ago; before that the forecast uses the existing profile with the request's timezone. `adopt = false`
 * (the labeller, which only reads) never stores a timezone.
 */
async function ensureProfile(db: Db, userId: string, tz: string, nowMs: number, adopt = true): Promise<EngineProfile> {
  let row = await readStored(db, userId);
  const mayAdopt = adopt && (!row?.timezone || !row.timezone_at || Date.parse(row.timezone_at) < nowMs - TIMEZONE_HOLD_MS);
  const saved = row?.timezone === tz || (mayAdopt && (await saveTimezone(db, userId, tz, nowMs)));
  let profile = parseProfile(row);
  const stale =
    !profile ||
    (saved && profile.timezone !== tz) ||
    (row?.dirty === 1 && Date.parse(row.computed_at) < nowMs - STALE_MS);
  if (stale) {
    try {
      await runEngineForUser({ DB: db }, userId, nowMs);
      row = await readStored(db, userId);
      profile = parseProfile(row) ?? profile;
    } catch (err) {
      if (!profile) throw err;
      log.warn('engine_inline_rebuild_failed', { userId, err });
    }
  }
  if (!profile) throw new Error('engine profile missing after rebuild');
  return profile;
}

type ProfileBasics = Pick<EngineProfile, 'mode' | 'historyDays' | 'categories'>;

/** What a past month needs of the profile (mode, history, baselines): the stored one if there is one, else derived without building it. */
async function pastBasics(db: Db, userId: string, tz: string, nowMs: number): Promise<ProfileBasics> {
  const stored = parseProfile(await readStored(db, userId));
  if (stored) return stored;
  const firstAt = await loadFirstTransactionAt(db, userId);
  const historyDays = firstAt ? Math.min(Math.max(0, dayNumber(tz, nowMs) - dayNumber(tz, Date.parse(firstAt))), HISTORY_CAP_DAYS) : 0;
  return { mode: modeForHistory(historyDays), historyDays, categories: {} };
}

interface StoredCopyRow {
  copy: string | null;
  copy_day: string | null;
}

const readStoredCopy = (db: Db, userId: string) =>
  first<StoredCopyRow>(db, 'SELECT copy, copy_day FROM engine_patterns WHERE user_id = ?', [userId]);

const patternColumns =
  'payee_key, display_name, kind, category_id, count_120d, median_amount, median_interval_days, interval_cv, last_at, next_expected_at, alpha, beta, suppressed';

/**
 * What the user hid, as `<target_kind>:<target_id>`: every dismissal, except that a running-hot category comes back next month
 * (`month` is the user's local month it was dismissed in; '' = no month), plus an unusual spend the user has answered ("one-off" or "not one-off"):
 * either way the card has done its job.
 */
async function loadDismissed(db: Db, userId: string, monthKey: string): Promise<Set<string>> {
  const rows = await all<{ target_kind: string; target_id: string; month: string }>(
    db,
    "SELECT target_kind, target_id, month FROM prediction_feedback WHERE user_id = ? AND (verdict = 'dismiss' OR (verdict IN ('one_off', 'not_one_off') AND target_kind = 'unusual_txn'))",
    [userId],
  );
  return new Set(rows.filter((r) => r.target_kind !== 'category_watch' || r.month === '' || r.month === monthKey).map((r) => `${r.target_kind}:${r.target_id}`));
}

const centsOrNull = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const cents = decimalToCents(value);
  return cents > 0 ? cents : null;
};

const money = (cents: number | null): string | null => (cents === null ? null : formatCents(cents));

export interface ForecastOptions {
  year: number;
  month: number;
  timezone: string;
}

/**
 * The forecast for a calendar month (docs/PREDICTIVE-ENGINE-PLAN.md §5, §8): the current month looks ahead (landing range,
 * safe to spend today, categories, coming up, watch); a past month reports what was actually spent. A future month is a
 * 422. Everything but the stored profile is read and computed on the request, so it always reflects the latest transaction.
 * The summary and the watch cards use the sentences the nightly labeller wrote for today when they pass the placeholder
 * guard, and the code templates otherwise.
 */
export async function getForecast(db: Db, userId: string, input: ForecastOptions, nowMs: number = Date.now()): Promise<ForecastResponse> {
  const { response, targets, stored } = await buildForecast(db, userId, input, nowMs);
  return targets && stored ? withStoredCopy(response, targets, stored) : response;
}

/** "Last month's forecast was within N%": the previous calendar month's error, once it has been scored. */
function lastMonthAccuracy(scored: readonly AccuracyMonth[], year: number, month: number): { lastMonthErrorPct: number } | null {
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const hit = scored.find((m) => m.year === previous.year && m.month === previous.month);
  return hit ? { lastMonthErrorPct: hit.errorPct } : null;
}

/**
 * The current month's forecast landing range in paise, for a snapshot (`scoring.ts`): the normal pipeline, but nothing is written
 * (a timezone is not adopted, and a stale profile is rebuilt only as `ensureProfile` always does). Null in learning mode,
 * which is the budget-only fallback and not worth scoring.
 */
export async function currentLanding(db: Db, userId: string, timezone: string, nowMs: number): Promise<{ landing: Range; year: number; month: number; day: number } | null> {
  const tz = parseTimezone(timezone);
  const { year, month, day } = localDate(tz, nowMs);
  const built = await buildForecast(db, userId, { year, month, timezone: tz }, nowMs, false);
  return built.response.mode === 'learning' ? null : { landing: built.landing, year, month, day };
}

/** What the labeller may rewrite in the current month's forecast (watch cards and the summary line), with the values it can use. */
export async function forecastCopyTargets(db: Db, userId: string, timezone: string, nowMs: number): Promise<CopyTargets | null> {
  const tz = parseTimezone(timezone);
  const { year, month } = localDate(tz, nowMs);
  return (await buildForecast(db, userId, { year, month, timezone: tz }, nowMs, false)).targets;
}

/** Today's model-written sentences in place of the templates, each only if it still fits the situation and renders. */
function withStoredCopy(response: ForecastResponse, targets: CopyTargets, row: StoredCopyRow): ForecastResponse {
  if (row.copy_day !== response.today) return response;
  const stored = parseStoredCopy(row.copy);
  if (!stored) return response;
  const summary =
    targets.summary && stored.summary?.situation === targets.summary.situation ? renderTemplate(stored.summary.template, targets.summary.values) : null;
  const byId = new Map(targets.watch.map((t) => [t.id, t]));
  const watch = response.watch.map((w) => {
    const target = byId.get(w.id);
    const template = target ? stored.watch?.[copyKey(w.id, target.variant)] : undefined;
    const text = template !== undefined && target ? renderTemplate(template, target.values) : null;
    return text === null ? w : { ...w, text };
  });
  return { ...response, summary: summary ?? response.summary, watch };
}

interface BuiltForecast {
  response: ForecastResponse;
  /** The month-end landing range in paise (before formatting): what a snapshot stores. */
  landing: Range;
  /** Null for a past month. */
  targets: CopyTargets | null;
  stored: StoredCopyRow | null;
}

async function buildForecast(db: Db, userId: string, input: ForecastOptions, nowMs: number, adoptTimezone = true): Promise<BuiltForecast> {
  const tz = parseTimezone(input.timezone);
  const { year, month } = input;
  const today = localDate(tz, nowMs);
  if (year * 12 + month > today.year * 12 + today.month) throw new ValidationError('Forecasts cover the current month and earlier months.');
  const current = year === today.year && month === today.month;
  const todayKey = dateKey(today);

  // A past month needs no fresh profile (and does not touch the stored timezone).
  const full = current ? await ensureProfile(db, userId, tz, nowMs, adoptTimezone) : null;
  const profile: ProfileBasics = full ?? (await pastBasics(db, userId, tz, nowMs));
  const range = monthRange(tz, year, month);
  const [summary, budgetRow, categoryBudgets, rows, recurring, patterns, dismissed, stored, accuracy] = await Promise.all([
    periodSummary(db, userId, range),
    fetchBudget(db, userId),
    listCategoryBudgets(db, userId),
    current ? loadEngineRows(db, userId, tz, nowMs) : Promise.resolve([] as EngineTxRow[]),
    current ? recurringRepo.listForUser(db, userId) : Promise.resolve([]),
    current ? all<PayeePatternRow>(db, `SELECT ${patternColumns} FROM payee_patterns WHERE user_id = ? AND count_120d > 0 AND suppressed = 0`, [userId]) : Promise.resolve([]),
    current ? loadDismissed(db, userId, dateKey(today).slice(0, 7)) : Promise.resolve(new Set<string>()),
    current ? readStoredCopy(db, userId) : Promise.resolve(null),
    current ? loadAccuracy(db, userId) : Promise.resolve([]),
  ]);

  const budget = centsOrNull(budgetRow?.monthly_budget);
  const categoryBudget = new Map<string, number>();
  for (const b of categoryBudgets) {
    const cents = centsOrNull(b.monthly_amount);
    if (cents !== null) categoryBudget.set(b.category_id.toLowerCase(), cents);
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthStartN = dateN({ year, month, day: 1 });
  const todayN = dateN(today);
  const monthEndN = monthStartN + daysInMonth - 1;
  const monthEndKey = dateKey({ year, month, day: daysInMonth });

  // This month's flexible spend, in total, today and per category (the profile's definition of flexible).
  const { flexibleSpentSoFar, flexibleSpentToday, spentToday, flexByCategory } = monthFlexSums(rows, tz, range, todayN);

  const bills = current ? billsStillDue(recurring, todayKey, monthEndKey) : { total: 0, byCategory: new Map<string, number>() };
  const spentSoFar = spentCents(summary);
  const result = full
    ? forecastLanding({
        profile: full,
        todayN,
        monthStartN,
        monthEndN,
        spentSoFar,
        flexibleSpentSoFar,
        flexibleSpentToday,
        billsStillDue: bills.total,
        budget,
        rng: mulberry32(hashSeed(`${userId}:${todayKey}`)),
      })
    : {
        landing: { p10: spentSoFar, p50: spentSoFar, p90: spentSoFar },
        flexibleRemaining: { p10: 0, p50: 0, p90: 0 },
        chanceUnder: budget === null ? null : spentSoFar <= budget ? 1 : 0,
      };

  // Categories: spend-scope ones with spend this month, a usual, or a budget.
  const spentBy = new Map<string, number>();
  for (const [key, cents] of summary.debitByCategory) spentBy.set(key === '' ? UNCATEGORIZED_KEY : key.toLowerCase(), cents);
  const baselineOf = (id: string) => {
    const median = profile.categories[id]?.median ?? 0;
    return median > 0 ? median : null;
  };
  const candidateIds = new Set<string>([...spentBy.keys(), ...Object.keys(profile.categories).map((k) => k.toLowerCase()), ...categoryBudget.keys()]);
  const metas = await fetchMetaByIds(db, [...candidateIds].filter((id) => id !== UNCATEGORIZED_KEY), userId);
  const shares = flexibleShares(profile, flexByCategory);
  // Each category's own usual for the rest of the month (a monthly bill already paid expects nothing more); empty with under 2 complete months.
  const restOfMonth = full ? categoryRestOfMonth(rows, tz, full.months, today.day) : new Map<string, number>();
  const named: Array<CategoryOutlook & { name: string; iconName: string | null; color: string | null }> = [];
  for (const id of candidateIds) {
    const meta = metas.get(id);
    if (id !== UNCATEGORIZED_KEY && meta?.scope !== 'spend') continue;
    const spent = spentBy.get(id) ?? 0;
    const baseline = baselineOf(id);
    const catBudget = categoryBudget.get(id) ?? null;
    if (spent === 0 && catBudget === null && (baseline === null || !current)) continue; // a past month lists only what was spent or budgeted
    const outlook = categoryOutlook(
      {
        id: id === UNCATEGORIZED_KEY ? null : id,
        spent,
        flexSpent: flexByCategory.get(id) ?? 0,
        billsDue: bills.byCategory.get(id) ?? 0,
        baseline,
        budget: catBudget,
        share: shares.get(id) ?? 0,
        restOfMonth: restOfMonth.get(id) ?? null,
      },
      result.flexibleRemaining.p50,
    );
    named.push({ ...outlook, name: meta?.name.trim() ?? 'Uncategorized', iconName: meta?.icon_name ?? null, color: meta?.color ?? null });
  }
  named.sort((a, b) => b.p50 - a.p50);
  const categories: ForecastCategory[] = named.slice(0, MAX_CATEGORIES).map((c) => ({
    id: c.id,
    name: c.name,
    iconName: c.iconName,
    color: c.color,
    spent: formatCents(c.spent),
    p50: formatCents(c.p50),
    budget: money(c.budget),
    baseline: money(c.baseline),
    status: c.status,
  }));

  const base = {
    year,
    month,
    today: todayKey,
    timezone: tz,
    mode: profile.mode,
    historyDays: profile.historyDays,
    landing: {
      p10: formatCents(result.landing.p10),
      p50: formatCents(result.landing.p50),
      p90: formatCents(result.landing.p90),
      budget: money(budget),
      chanceUnder: result.chanceUnder === null ? null : Math.round(result.chanceUnder * 100) / 100,
      spentSoFar: formatCents(spentSoFar),
      billsStillDue: formatCents(bills.total),
      flexibleRemaining: formatCents(result.flexibleRemaining.p50),
    },
    categories,
    accuracy: lastMonthAccuracy(accuracy, year, month),
  };
  if (!full) {
    return {
      landing: result.landing,
      response: { ...base, safeToday: null, upcoming: [], watch: [], summary: pastMonthText({ month, spent: spentSoFar, budget }) },
      targets: null,
      stored: null,
    };
  }

  const safe = safeToday({ profile: full, todayN, monthEndN, spentSoFar, spentToday, billsStillDue: bills.total, budget });
  const upcoming: ForecastUpcomingItem[] = buildUpcoming({
    today,
    tz,
    recurring,
    patterns,
    rows,
    dismissed,
    learning: profile.mode === 'learning',
  }).map((u) => ({ ...u, amount: formatCents(u.amount) }));
  const watchItems = buildWatch({
    tz,
    today,
    mode: profile.mode,
    categories: named,
    rows,
    monthFrom: range.from,
    patterns,
    recurring,
    dismissed,
  });
  const watch: ForecastWatchItem[] = watchItems.map(
    ({ copy: _copy, ...w }) => ({ ...w, ...(w.amount === undefined ? {} : { amount: formatCents(w.amount) }) }) as ForecastWatchItem,
  );
  const hotId = watch.find((w) => w.kind === 'category_hot')?.categoryId;
  const summaryInput: SummaryInput = {
    mode: profile.mode,
    historyDays: profile.historyDays,
    p50: result.landing.p50,
    budget,
    chanceUnder: result.chanceUnder,
    watchCategory: named.find((c) => c.id === hotId)?.name ?? null,
    spentSoFar,
  };
  return {
    landing: result.landing,
    response: {
      ...base,
      safeToday: {
        amount: money(safe.amount),
        usualForWeekday: formatCents(safe.usual),
        weekday: safe.weekday,
      },
      upcoming,
      watch,
      summary: summaryText(summaryInput),
    },
    targets: {
      summary: summaryTarget(summaryInput),
      watch: watchItems.map((w) => ({ id: w.id, kind: w.kind, ...w.copy })),
    },
    stored,
  };
}
