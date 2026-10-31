import type { Db } from '../../core/db';
import type { Bindings } from '../../core/env';
import { log } from '../../core/logging';
import { dateKey, localDate } from '../../core/timezone';
import { createEmitter } from '../notifications/emitter';
import type { Emitter, PushSender } from '../notifications/emitter';
import { publishChanges } from '../realtime/publish';
import * as recurringRepo from '../recurring/repository';
import { parseDateKey } from '../recurring/schedule';
import type { RecurringRow } from '../recurring/schemas';
import { fetchByUserId } from '../user-settings/repository';
import { settingsFromRow } from '../user-settings/snapshot';
import type { UserSettings } from '../user-settings/snapshot';
import { nextFireIso, recurringInput, reminderCopy, reminderInput } from './plan';
import * as repo from './repository';
import { advanceDue, daysBetween, dueNow } from './schedule';
import type { ReminderRow } from './schemas';

/**
 * Rows handled per cron run, reminders and recurring items TOGETHER (reminders first, oldest first, then recurring items with
 * what is left); the rest wait for the next 5-minute run. Each row costs a few D1 round trips, and this keeps one run well inside
 * the per-invocation subrequest limit.
 */
// ponytail: raise it or fan out onto a queue if it ever backs up; the leftover count in the log says when.
export const TICK_CAP = 60;

export interface RunCounts {
  /** Rows selected (their next instant had arrived). */
  due: number;
  /** Notifications handed to the emitter (a deduped repeat still counts: it inserts nothing). */
  sent: number;
  failed: number;
}

export interface SendRunResult {
  reminders: RunCounts;
  recurring: RunCounts;
  /** Rows that were due but did not fit under `TICK_CAP` (they go first in the next run). */
  leftover: { reminders: number; recurring: number };
}

interface Recipient {
  settings: UserSettings;
  emitter: Emitter;
}

/** Settings + emitter of each user, read once per run. */
function recipients(env: Bindings, db: Db, pushSend: PushSender | undefined): (userId: string) => Promise<Recipient> {
  const cache = new Map<string, Promise<Recipient>>();
  return (userId) => {
    let hit = cache.get(userId);
    if (!hit) {
      hit = fetchByUserId(db, userId).then((row) => {
        const settings = settingsFromRow(row);
        return { settings, emitter: createEmitter(db, userId, settings, pushSend, (events) => publishChanges(env, userId, events)) };
      });
      cache.set(userId, hit);
    }
    return hit;
  };
}

const iso = (ms: number): string => new Date(ms).toISOString();

/**
 * One due reminder: send the latest due step (earlier ones the cron missed are dropped), then move the schedule on. A repeating
 * reminder whose last step is behind it rolls to its next occurrence. Emit first, then advance: a crash in between re-sends at
 * worst, and the dedupe key makes the re-send a no-op. With reminders switched off nothing is sent but the schedule still moves.
 */
async function handleReminder(db: Db, row: ReminderRow, who: Recipient, nowMs: number): Promise<boolean> {
  const { settings, emitter } = who;
  const repeating = row.cadence !== 'none';
  const input = reminderInput(row, settings);
  const after = row.fired_through ? Date.parse(row.fired_through) : -Infinity;
  const due = dueNow(input, after, nowMs, repeating);

  let sent = false;
  if (due.step && settings.reminders_enabled) {
    const copy = reminderCopy({
      direction: row.direction,
      title: row.title,
      counterparty: row.counterparty_name,
      amountCents: row.amount,
      hideAmounts: settings.reminder_hide_amounts,
      days: daysBetween(localDate(row.timezone, nowMs), parseDateKey(row.due_date)),
    });
    await emitter.reminderDue({ reminderId: row.id, dedupeKey: `reminder:${row.id}:${row.due_date}:${due.step.key}`, ...copy });
    sent = true;
  }

  const expected = { due_date: row.due_date, next_fire_at: row.next_fire_at as string };
  if (due.roll && row.cadence !== 'none') {
    const rolledDue = dateKey(advanceDue(row.cadence, row.anchor_day, parseDateKey(row.due_date), localDate(row.timezone, nowMs)));
    const next = nextFireIso(reminderInput({ ...row, due_date: rolledDue }, settings), nowMs, true);
    await repo.advance(db, row.id, expected, { due_date: rolledDue, fired_through: null, next_fire_at: next });
  } else {
    const through = due.step ? due.step.atMs : Math.max(after, nowMs);
    await repo.advance(db, row.id, expected, {
      due_date: row.due_date,
      fired_through: due.step ? iso(due.step.atMs) : row.fired_through,
      next_fire_at: nextFireIso(input, through, repeating),
    });
  }
  return sent;
}

/** One recurring item with lead-day reminders on: the same step logic, no overdue nudges, no roll (the poster moves the item). */
async function handleRecurring(db: Db, item: RecurringRow, who: Recipient, nowMs: number): Promise<boolean> {
  const { settings, emitter } = who;
  const input = recurringInput(item, settings);
  let sent = false;
  let next: string | null = null;
  if (input) {
    const due = dueNow(input, -Infinity, nowMs, false);
    const days = daysBetween(localDate(item.timezone, nowMs), parseDateKey(item.next_due_date));
    // A step for a due date that already passed (the poster has not moved the item yet) is not worth a notification.
    if (due.step && days >= 0 && settings.reminders_enabled) {
      const copy = reminderCopy({
        direction: item.kind === 'income' ? 'receive' : 'pay',
        title: item.name,
        counterparty: null,
        amountCents: item.amount,
        hideAmounts: settings.reminder_hide_amounts,
        days,
      });
      await emitter.reminderDue({ reminderId: null, dedupeKey: `reminder:rec:${item.id}:${item.next_due_date}:${due.step.key}`, ...copy });
      sent = true;
    }
    next = nextFireIso(input, nowMs, false);
  }
  await recurringRepo.setNextRemind(db, item.id, item.next_remind_at as string, next);
  return sent;
}

/** Runs `handle` over `rows`; one failing row is logged and never stops the others. */
async function runBatch<T extends { id: string; user_id: string }>(
  rows: readonly T[],
  recipient: (userId: string) => Promise<Recipient>,
  handle: (row: T, who: Recipient) => Promise<boolean>,
  failure: string,
): Promise<RunCounts> {
  const counts: RunCounts = { due: rows.length, sent: 0, failed: 0 };
  for (const row of rows) {
    try {
      if (await handle(row, await recipient(row.user_id))) counts.sent += 1;
    } catch (err) {
      counts.failed += 1;
      log.error(failure, { id: row.id, err });
    }
  }
  return counts;
}

/**
 * Cron entry (every 5 minutes): sends the notification of every open reminder and every recurring item whose next reminder
 * instant has arrived, then moves its schedule on, at most `TICK_CAP` rows in all. Idempotent (dedupe keys, conditional
 * advance). `deps.pushSend` replaces the Expo push sender (tests).
 */
export async function sendDueReminders(env: Bindings, nowMs: number = Date.now(), deps: { pushSend?: PushSender } = {}): Promise<SendRunResult> {
  const db = env.DB;
  const recipient = recipients(env, db, deps.pushSend);
  const nowIsoText = iso(nowMs);
  const none: RunCounts = { due: 0, sent: 0, failed: 0 };
  const result: SendRunResult = { reminders: none, recurring: none, leftover: { reminders: 0, recurring: 0 } };
  let failure: Error | undefined;

  try {
    const rows = await repo.listDue(db, nowIsoText, TICK_CAP + 1);
    if (rows.length > TICK_CAP) result.leftover.reminders = (await repo.countDue(db, nowIsoText)) - TICK_CAP;
    result.reminders = await runBatch(rows.slice(0, TICK_CAP), recipient, (r, who) => handleReminder(db, r, who, nowMs), 'reminder_send_failed');
  } catch (err) {
    failure = err instanceof Error ? err : new Error(String(err)); // the recurring items below still get their turn
  }

  try {
    const budget = TICK_CAP - result.reminders.due;
    const rows = budget > 0 ? await recurringRepo.listRemindDue(db, nowIsoText, budget + 1) : [];
    if (budget <= 0 || rows.length > budget) result.leftover.recurring = (await recurringRepo.countRemindDue(db, nowIsoText)) - Math.max(budget, 0);
    result.recurring = await runBatch(rows.slice(0, Math.max(budget, 0)), recipient, (r, who) => handleRecurring(db, r, who, nowMs), 'recurring_reminder_failed');
  } catch (err) {
    failure ??= err instanceof Error ? err : new Error(String(err));
  }
  if (failure) throw failure;

  const { reminders, recurring, leftover } = result;
  if (reminders.due + recurring.due > 0) log.info('reminders_sent', { reminders, recurring, leftover });
  if (leftover.reminders + leftover.recurring > 0) log.warn('reminders_tick_capped', { cap: TICK_CAP, leftover });
  return result;
}
