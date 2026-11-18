import type { Db } from '../../core/db';
import { NotFoundError } from '../../core/errors';
import { log } from '../../core/logging';
import { IST, localDate, monthDates, monthKey, parseMonthKey, shiftMonth } from '../../core/timezone';
import type { YearMonth } from '../../core/timezone';
import { MONTH_FULL } from '../agent/dates';
import { createEmitter } from '../notifications/emitter';
import type { PushSender } from '../notifications/emitter';
import type { Publisher } from '../realtime/events';
import { getOrCreate as getSettings, resolveUserTimezone } from '../user-settings/service';
import * as repo from './repository';
import { MIN_REPORT_DEBITS, REPORT_LIST_MONTHS, REPORT_VERSION } from './schemas';
import type { ReportListResponse, ReportSnapshot } from './schemas';
import { HISTORY_MONTHS, buildSnapshot } from './snapshot';

/**
 * Broke Report: the snapshot of one finished month, cut in the user's own timezone. It is built ONLY by the cron / queue path (`buildReport`, called
 * from `deliverReport`) and stored immutably; the HTTP routes just read what is stored. An older snapshot version is
 * replaced only when `buildReport` runs again for that month (a manual re-run).
 */

const NOT_FOUND = 'Report not found.';

/** The current calendar month in `tz` (IST unless the caller knows the user's zone). */
export function currentMonth(nowMs: number, tz: string = IST): YearMonth {
  const today = localDate(tz, nowMs);
  return { year: today.year, month: today.month };
}

/** Only a complete month (in `tz`) can have a report. */
export function isPastMonth(ym: YearMonth, nowMs: number, tz: string = IST): boolean {
  const now = currentMonth(nowMs, tz);
  return ym.year * 12 + ym.month < now.year * 12 + now.month;
}

function parseStored(json: string): ReportSnapshot | null {
  try {
    return JSON.parse(json) as ReportSnapshot;
  } catch {
    return null;
  }
}

/** The stored snapshot of `periodKey`. Never builds: 404 when the cron has not produced one (also for a current/future month). */
export async function getReport(db: Db, userId: string, periodKey: string): Promise<ReportSnapshot> {
  const row = await repo.getStored(db, userId, periodKey);
  const snapshot = row ? parseStored(row.snapshot) : null;
  if (!snapshot) throw new NotFoundError(NOT_FOUND);
  return snapshot;
}

/** The user's stored reports of the last 12 months, newest first. Reads only. */
export async function listReports(db: Db, userId: string, nowMs: number): Promise<ReportListResponse> {
  const now = currentMonth(nowMs, await resolveUserTimezone(db, userId));
  const first = shiftMonth(now, -REPORT_LIST_MONTHS);
  const last = shiftMonth(now, -1);
  const rows = await repo.listStored(db, userId, monthKey(first.year, first.month), monthKey(last.year, last.month));
  return {
    items: rows.flatMap((r) => {
      const ym = parseMonthKey(r.period_key);
      return ym ? [{ period_key: r.period_key, year: ym.year, month: ym.month, debit_count: r.debit_count, viewed: r.viewed }] : [];
    }),
  };
}

export type BuildOutcome = 'built' | 'exists' | 'ineligible';

/**
 * Build and store the snapshot for `(user, period)` unless a current one is already stored. Idempotent and race-safe
 * (insert-or-ignore: a concurrent build that lost keeps the winner's row). `ineligible` = not a finished month, or fewer
 * than 5 debits.
 */
export async function buildReport(db: Db, userId: string, periodKey: string, nowMs: number): Promise<BuildOutcome> {
  const ym = parseMonthKey(periodKey);
  if (!ym) return 'ineligible';
  const tz = await resolveUserTimezone(db, userId);
  if (!isPastMonth(ym, nowMs, tz)) return 'ineligible';

  const stored = await repo.getStored(db, userId, periodKey);
  if (stored && stored.version >= REPORT_VERSION && parseStored(stored.snapshot)) return 'exists';

  const range = monthDates(ym.year, ym.month);
  const oldest = shiftMonth(ym, -HISTORY_MONTHS);
  const before = shiftMonth(ym, -1);
  const data = await repo.fetchMonthData(db, userId, range, { from: monthDates(oldest.year, oldest.month).from, to: monthDates(before.year, before.month).to });
  if (data.debits.length < MIN_REPORT_DEBITS) return 'ineligible';

  const snapshot = buildSnapshot({
    year: ym.year,
    month: ym.month,
    nowIso: new Date(nowMs).toISOString(),
    timezone: tz,
    debits: data.debits,
    incomeCents: data.incomeCents,
    categories: data.categories,
    earlier: data.earlier,
  });
  const written = await repo.saveSnapshot(db, userId, periodKey, REPORT_VERSION, JSON.stringify(snapshot));
  return written !== null ? 'built' : 'exists';
}

/** Marks the report seen (the first time wins). 404 when it was never built. */
export async function markViewed(db: Db, userId: string, periodKey: string): Promise<void> {
  if (!(await repo.markViewed(db, userId, periodKey))) throw new NotFoundError(NOT_FOUND);
}

export interface ReportDeliveryDeps {
  db: Db;
  /** Live-update broadcast for the in-app bell (the queue consumer passes `envPublisher(env)`). */
  publisher?: Publisher | undefined;
  pushSend?: PushSender | undefined;
  nowMs?: number | undefined;
}

export type ReportDeliveryOutcome = 'notified' | 'skipped';

/** Generic English copy: the roast copy is client-side, so the push and the inbox row carry only the month. */
export function reportReadyCopy(month: number): { title: string; body: string } {
  return { title: `Your ${MONTH_FULL[month - 1] ?? ''} Broke Report is ready`, body: 'See how your wallet did.' };
}

/**
 * Queue-consumer step for one `(user, period)`: build the snapshot (idempotent; for every user, whatever their alert
 * setting), then emit the `report_ready` notification (deduped on `report:<period>`, gated by `report_alerts_enabled`,
 * pushed when device notifications are on). `skipped` = the month has no report. Errors propagate so the consumer can
 * retry or give up.
 */
export async function deliverReport(deps: ReportDeliveryDeps, input: { userId: string; periodKey: string }): Promise<ReportDeliveryOutcome> {
  const { db } = deps;
  const { userId, periodKey } = input;
  if ((await buildReport(db, userId, periodKey, deps.nowMs ?? Date.now())) === 'ineligible') return 'skipped';
  const ym = parseMonthKey(periodKey) as YearMonth;
  const settings = await getSettings(db, userId);
  const publisher = deps.publisher;
  const emitter = createEmitter(db, userId, settings, deps.pushSend, publisher ? (events) => publisher(userId, events) : undefined);
  await emitter.reportReady({ periodKey: monthKey(ym.year, ym.month), ...reportReadyCopy(ym.month) });
  // Handled (also when alerts are off): the catch-up fan-out stops picking this user. A throw above leaves it NULL.
  await repo.markNotified(db, userId, periodKey);
  log.info('report_delivered', { userId, periodKey });
  return 'notified';
}
