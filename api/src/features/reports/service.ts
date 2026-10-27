import type { Db } from '../../core/db';
import { NotFoundError } from '../../core/errors';
import { log } from '../../core/logging';
import { localDate, monthRange } from '../../core/timezone';
import { MONTH_FULL } from '../agent/dates';
import { IST } from '../email/periods';
import { createEmitter } from '../notifications/emitter';
import type { PushSender } from '../notifications/emitter';
import type { Publisher } from '../realtime/events';
import { getOrCreate as getSettings } from '../user-settings/service';
import * as repo from './repository';
import { MIN_REPORT_DEBITS, REPORT_LIST_MONTHS, REPORT_VERSION } from './schemas';
import type { ReportListResponse, ReportSnapshot } from './schemas';
import { HISTORY_MONTHS, buildSnapshot, periodKeyOf } from './snapshot';

/**
 * Broke Report: the snapshot of one finished IST month. It is built ONLY by the cron / queue path (`buildReport`, called
 * from `deliverReport`) and stored immutably; the HTTP routes just read what is stored. An older snapshot version is
 * replaced only when `buildReport` runs again for that month (a manual re-run).
 */

const NOT_FOUND = 'Report not found.';

export interface YearMonth {
  year: number;
  month: number;
}

/** `2026-09` -> `{ 2026, 9 }`; null for anything else. */
export function parsePeriodKey(periodKey: string): YearMonth | null {
  const m = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year: Number(m[1]), month } : null;
}

/** `delta` months from `ym` (negative = earlier). */
export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const index = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The current calendar month in IST. */
export function currentMonth(nowMs: number): YearMonth {
  const today = localDate(IST, nowMs);
  return { year: today.year, month: today.month };
}

/** Only a complete month can have a report. */
export function isPastMonth(ym: YearMonth, nowMs: number): boolean {
  const now = currentMonth(nowMs);
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
  const now = currentMonth(nowMs);
  const first = shiftMonth(now, -REPORT_LIST_MONTHS);
  const last = shiftMonth(now, -1);
  const rows = await repo.listStored(db, userId, periodKeyOf(first.year, first.month), periodKeyOf(last.year, last.month));
  return {
    items: rows.flatMap((r) => {
      const ym = parsePeriodKey(r.period_key);
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
  const ym = parsePeriodKey(periodKey);
  if (!ym || !isPastMonth(ym, nowMs)) return 'ineligible';

  const stored = await repo.getStored(db, userId, periodKey);
  if (stored && stored.version >= REPORT_VERSION && parseStored(stored.snapshot)) return 'exists';

  const range = monthRange(IST, ym.year, ym.month);
  const oldest = shiftMonth(ym, -HISTORY_MONTHS);
  const data = await repo.fetchMonthData(db, userId, range, { from: monthRange(IST, oldest.year, oldest.month).from, to: range.from });
  if (data.debits.length < MIN_REPORT_DEBITS) return 'ineligible';

  const snapshot = buildSnapshot({
    year: ym.year,
    month: ym.month,
    nowIso: new Date(nowMs).toISOString(),
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
  const ym = parsePeriodKey(periodKey) as YearMonth;
  const settings = await getSettings(db, userId);
  const publisher = deps.publisher;
  const emitter = createEmitter(db, userId, settings, deps.pushSend, publisher ? (events) => publisher(userId, events) : undefined);
  await emitter.reportReady({ periodKey: periodKeyOf(ym.year, ym.month), ...reportReadyCopy(ym.month) });
  // Handled (also when alerts are off): the catch-up fan-out stops picking this user. A throw above leaves it NULL.
  await repo.markNotified(db, userId, periodKey);
  log.info('report_delivered', { userId, periodKey });
  return 'notified';
}
