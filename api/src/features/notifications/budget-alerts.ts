import type { Context } from 'hono';

import { defer } from '../../core/background';
import { all, chunks, placeholders, run } from '../../core/db';
import type { Db } from '../../core/db';
import type { AppBindings } from '../../core/env';
import { IST, localDate, monthDates, monthKeyOf, parseMonthKey, parseTimezone } from '../../core/timezone';
import { categoryCapsCents, monthlyCapCents } from '../budgets/history';
import { fetchMetaByIds } from '../categories/repository';
import type { CategoryMeta } from '../categories/repository';
import { periodLedger } from '../transactions/ledger';
import { deleted } from '../realtime/events';
import type { Publish } from '../realtime/events';
import { emit as emitChanges } from '../realtime/publish';
import { fetchByUserId } from '../user-settings/repository';
import { settingsFromRow } from '../user-settings/snapshot';
import type { UserSettings } from '../user-settings/snapshot';
import { createEmitter, formatInrCents } from './emitter';
import type { Emitter, PushSender } from './emitter';

/**
 * Budget alerts as a function of the data (docs/MONEY-MODEL-FIX-PLAN.md R3), not of the last write. After ANY change that can
 * move a month's spend or its caps (a transaction created, edited, deleted; a payback linked or unlinked; a budget or category
 * budget changed; a recurring item opting in or out of the budget; a recurring posting) the affected months are reconciled:
 * every threshold that is true right now exists as one alert, and an alert whose threshold is no longer true is retired
 * (its notification row is deleted). What was announced is remembered in `budget_alert_marks` (the cap in force when it was raised):
 * a threshold that comes true again under the SAME cap is re-listed silently (already read, no push), so an edit that oscillates
 * around a threshold never pings twice; under a different cap it is a new alert with a push. The notification insert is deduped on
 * `(user_id, dedupe_key)` and pushes only when it inserted a row, so concurrent reconciles cannot double-push. Only the current local
 * month raises alerts (notification, push, live update); a past month is reconciled silently (retire only), so editing an old
 * transaction never pings.
 */

/** What a write hands back to its caller's background queue: the `YYYY-MM` months whose alerts should be re-checked. */
export type AfterWrite = (months: string[]) => void | Promise<void>;

interface Threshold {
  /** `spent * 100 >= warnPct * cap` */
  warn: boolean;
  over: boolean;
}

/** Exact integer comparison of `spent / cap` with the warn ratio and with 1 (cents in, no floats). */
export function crossedThresholds(spentCents: number, capCents: number, warnPct: number): Threshold {
  return { warn: spentCents * 100 >= warnPct * capCents, over: spentCents > capCents };
}

export interface ReconcileOptions {
  /** The caller's own timezone name, used only when the user stored none. */
  timezone?: string | undefined;
  nowMs?: number | undefined;
  /** Live-update broadcast (new and retired alert rows). */
  publish?: Publish | undefined;
}

/** `budget:monthly:80:2026-10` / `budget:category:<category id>:80:2026-10` (the keys the emitter writes). */
const MONTHLY_KEY = /^budget:monthly:(\d+):(\d{4}-\d{2})$/;
const CATEGORY_KEY = /^budget:category:([0-9a-f-]+):(\d+):(\d{4}-\d{2})$/;

interface ExistingAlert {
  id: string;
  threshold: number;
  key: string;
}

/** An alert being retired: its row goes, its mark stays (written here when the alert predates the marks). */
interface Retiring {
  id: string;
  key: string;
  cap: number;
}

/** One budget to check: the monthly cap or one category's. */
interface Scope {
  categoryId: string | null;
  spent: number;
  cap: number;
  warnPct: number;
}

function userTimezone(settings: UserSettings, hint: string | undefined): string {
  for (const candidate of [settings.timezone, hint]) {
    if (!candidate) continue;
    try {
      return parseTimezone(candidate);
    } catch {
      // unknown name: try the next one
    }
  }
  return IST;
}

/** The alerts of one month that exist, by scope: `monthly` and per category id. */
async function existingAlerts(
  db: Db,
  userId: string,
  month: string,
): Promise<{ monthly: ExistingAlert[]; category: Map<string, ExistingAlert[]>; marks: Map<string, number> }> {
  const rows = await all<{ id: string; dedupe_key: string }>(
    db,
    `SELECT id, dedupe_key FROM notifications WHERE user_id = ? AND dedupe_key LIKE 'budget:%' AND dedupe_key LIKE ?`,
    [userId, `%:${month}`],
  );
  const markRows = await all<{ dedupe_key: string; cap_cents: number }>(db, 'SELECT dedupe_key, cap_cents FROM budget_alert_marks WHERE user_id = ? AND dedupe_key LIKE ?', [userId, `budget:%:${month}`]);
  const marks = new Map(markRows.map((m) => [m.dedupe_key, m.cap_cents]));
  const monthly: ExistingAlert[] = [];
  const category = new Map<string, ExistingAlert[]>();
  for (const row of rows) {
    const m = MONTHLY_KEY.exec(row.dedupe_key);
    if (m) {
      monthly.push({ id: row.id, threshold: Number(m[1]), key: row.dedupe_key });
      continue;
    }
    const c = CATEGORY_KEY.exec(row.dedupe_key);
    if (c && c[1]) category.set(c[1], [...(category.get(c[1]) ?? []), { id: row.id, threshold: Number(c[2]), key: row.dedupe_key }]);
  }
  return { monthly, category, marks };
}

/**
 * Delete alert rows (any state, including ones the user dismissed): their threshold is no longer true. The mark of an alert that
 * has none yet (raised before marks existed) is written first, so the dedupe memory survives the delete.
 */
async function retire(db: Db, userId: string, alerts: readonly Retiring[], publish: Publish | undefined): Promise<void> {
  for (const a of alerts) await run(db, 'INSERT OR IGNORE INTO budget_alert_marks (user_id, dedupe_key, cap_cents) VALUES (?, ?, ?)', [userId, a.key, a.cap]);
  const ids = alerts.map((a) => a.id);
  for (const part of chunks(ids, 80)) {
    await run(db, `DELETE FROM notifications WHERE user_id = ? AND id IN (${placeholders(part.length)})`, [userId, ...part]);
  }
  await emitChanges(publish, ids.map((id) => deleted('notifications', id)));
}

/**
 * Reconcile the budget alerts of `months` (`YYYY-MM` keys) for one user against the ledger and the caps in force in each month.
 * Alerts of a scope the user switched off are left alone (no new ones, none retired).
 */
export async function reconcileBudgetAlerts(
  db: Db,
  emitter: Emitter,
  settings: UserSettings,
  userId: string,
  months: readonly string[],
  opts: ReconcileOptions = {},
): Promise<void> {
  const tz = userTimezone(settings, opts.timezone);
  const currentMonth = monthKeyOf(localDate(tz, opts.nowMs ?? Date.now()));

  for (const month of new Set(months)) {
    const ym = parseMonthKey(month);
    if (!ym) continue;
    const [ledger, monthlyCap, categoryCaps, existing] = await Promise.all([
      periodLedger(db, userId, { dates: monthDates(ym.year, ym.month) }),
      settings.budget_monthly_alerts_enabled ? monthlyCapCents(db, userId, month) : Promise.resolve(0),
      settings.budget_category_alerts_enabled ? categoryCapsCents(db, userId, month) : Promise.resolve(new Map<string, number>()),
      existingAlerts(db, userId, month),
    ]);
    const live = month === currentMonth;
    const retired: Retiring[] = [];
    const io = (keyFor: (threshold: number) => string): ScopeIo => ({ keyFor, marks: existing.marks, retired, mark: (key, cap) => markRaised(db, userId, key, cap) });

    if (settings.budget_category_alerts_enabled) {
      const ids = new Set([...categoryCaps.keys(), ...existing.category.keys()]);
      const names = live && ids.size > 0 ? await fetchMetaByIds(db, [...ids], userId) : new Map<string, CategoryMeta>();
      for (const categoryId of ids) {
        const scope: Scope = {
          categoryId,
          spent: ledger.budgetSpendByCategory.get(categoryId) ?? 0,
          cap: categoryCaps.get(categoryId) ?? 0,
          warnPct: settings.budget_category_warn_pct,
        };
        const rawName = names.get(categoryId)?.name;
        const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : 'Category';
        await reconcileScope(
          scope,
          existing.category.get(categoryId) ?? [],
          io((threshold) => `budget:category:${categoryId}:${threshold}:${month}`),
          live ? (threshold, warnPct, silent) => emitCategory(emitter, scope, name, month, threshold, warnPct, silent) : null,
        );
      }
    }

    if (settings.budget_monthly_alerts_enabled) {
      const scope: Scope = { categoryId: null, spent: ledger.budgetSpendCents, cap: monthlyCap, warnPct: settings.budget_monthly_warn_pct };
      await reconcileScope(
        scope,
        existing.monthly,
        io((threshold) => `budget:monthly:${threshold}:${month}`),
        live ? (threshold, warnPct, silent) => emitMonthly(emitter, scope, month, threshold, warnPct, silent) : null,
      );
    }

    if (retired.length > 0) await retire(db, userId, retired, opts.publish);
  }
}

interface ScopeIo {
  keyFor: (threshold: number) => string;
  /** Caps the alerts of this month were raised under, by dedupe key. */
  marks: Map<string, number>;
  retired: Retiring[];
  mark: (key: string, cap: number) => Promise<void>;
}

async function markRaised(db: Db, userId: string, key: string, cap: number): Promise<void> {
  await run(db, 'INSERT INTO budget_alert_marks (user_id, dedupe_key, cap_cents) VALUES (?, ?, ?) ON CONFLICT (user_id, dedupe_key) DO UPDATE SET cap_cents = excluded.cap_cents', [userId, key, cap]);
}

/**
 * One scope: retire the alerts whose threshold is no longer true and, for the current month, raise the highest true threshold
 * when it has no alert yet (one push even when a debit crosses both thresholds at once). A threshold already announced under the
 * same cap comes back silently (see the header).
 */
async function reconcileScope(
  scope: Scope,
  existing: readonly ExistingAlert[],
  io: ScopeIo,
  raise: ((threshold: number, warnPct: number, silent: boolean) => Promise<void>) | null,
): Promise<void> {
  const { warn, over } = scope.cap > 0 ? crossedThresholds(scope.spent, scope.cap, scope.warnPct) : { warn: false, over: false };
  const trueThresholds = new Set<number>();
  if (warn) trueThresholds.add(scope.warnPct);
  if (over) trueThresholds.add(100);
  for (const alert of existing) if (!trueThresholds.has(alert.threshold)) io.retired.push({ id: alert.id, key: alert.key, cap: scope.cap });

  const highest = over ? 100 : warn ? scope.warnPct : null;
  if (raise && highest !== null && !existing.some((a) => a.threshold === highest)) {
    const key = io.keyFor(highest);
    const announced = io.marks.get(key) === scope.cap;
    // The mark goes first: whatever happens to the insert or the push, the threshold is never pushed twice for this cap.
    if (!announced) await io.mark(key, scope.cap);
    await raise(highest, scope.warnPct, announced);
  }
}

function emitMonthly(emitter: Emitter, scope: Scope, month: string, threshold: number, warnPct: number, silent: boolean): Promise<void> {
  const over = threshold === 100;
  return emitter.budgetThreshold({
    scope: 'monthly',
    periodKey: month,
    threshold,
    title: over ? 'Monthly budget exceeded' : `${warnPct}% of monthly budget used`,
    body: over
      ? `You're ${formatInrCents(scope.spent - scope.cap)} over your ${formatInrCents(scope.cap)} monthly budget.`
      : `You've spent ${formatInrCents(scope.spent)} of ${formatInrCents(scope.cap)} this month.`,
    silent,
  });
}

function emitCategory(emitter: Emitter, scope: Scope, name: string, month: string, threshold: number, warnPct: number, silent: boolean): Promise<void> {
  const over = threshold === 100;
  return emitter.categoryBudgetThreshold({
    categoryId: scope.categoryId as string,
    periodKey: month,
    threshold,
    title: over ? `${name} budget exceeded` : `${warnPct}% of ${name} budget used`,
    body: over
      ? `You're ${formatInrCents(scope.spent - scope.cap)} over your ${formatInrCents(scope.cap)} ${name} budget this month.`
      : `You've spent ${formatInrCents(scope.spent)} of ${formatInrCents(scope.cap)} on ${name} this month.`,
    silent,
  });
}

/**
 * `reconcileBudgetAlerts` for a user the caller only knows by id: loads their settings and builds the emitter. Never throws
 * (an alert failing must not fail the write that triggered it).
 */
export async function reconcileUserBudgetAlerts(
  db: Db,
  userId: string,
  months: readonly string[],
  opts: ReconcileOptions & { pushSend?: PushSender | undefined } = {},
): Promise<void> {
  if (months.length === 0) return;
  const settings = settingsFromRow(await fetchByUserId(db, userId));
  const emitter = createEmitter(db, userId, settings, opts.pushSend, opts.publish);
  await reconcileBudgetAlerts(db, emitter, settings, userId, months, opts);
}

/** For HTTP routes: the reconcile runs in `waitUntil` after the response, and a failure is only logged. */
export function deferBudgetAlerts(c: Context<AppBindings>, db: Db, userId: string, publish?: Publish, timezone?: string): AfterWrite {
  return (months) => defer(c, reconcileUserBudgetAlerts(db, userId, months, { publish, timezone }), 'budget_alerts');
}
