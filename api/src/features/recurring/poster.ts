import type { Db } from '../../core/db';
import { formatCents } from '../../core/decimal';
import type { Bindings } from '../../core/env';
import { getConfig } from '../../core/env';
import { log } from '../../core/logging';
import { dateKey } from '../../core/timezone';
import type { LocalDate } from '../../core/timezone';
import { mediaStore } from '../media/storage';
import { reconcileUserBudgetAlerts } from '../notifications/budget-alerts';
import { publishChanges } from '../realtime/publish';
import { nextRemindIso } from '../reminders/plan';
import { createTransaction } from '../transactions/service';
import type { CreateResult, TxContext } from '../transactions/service';
import { fetchByUserId } from '../user-settings/repository';
import { settingsFromRow } from '../user-settings/snapshot';
import * as repo from './repository';
import { dueInstantMs, planOccurrences } from './schedule';
import type { RecurringRow } from './schemas';

/** Items posted per cron run (oldest due first); the rest wait for the next 5-minute run. */
// ponytail: 50 per run is plenty for a personal-finance app and keeps one run well inside D1's per-invocation subrequest limit;
// if it ever backs up, raise it (and the cap) or fan out onto a queue like the email digest.
export const POST_BATCH = 50;
/** Largest UTC offset is +14:00, so a local date can be one day ahead of the UTC date. */
const MAX_OFFSET_MS = 14 * 3_600_000;

/**
 * Creates the transaction of one occurrence: a normal manual-source row at 06:00 local of `due`. Its identity is
 * `(item, occurrence = the due date)`: a live row for that pair at most (a unique index), so posting the same occurrence twice,
 * or after the user linked their own entry to it, returns the existing row instead of a second one. The budget alerts of the
 * month are re-checked by the context's `afterWrite`.
 */
export async function postOccurrence(ctx: TxContext, item: RecurringRow, due: LocalDate): Promise<CreateResult> {
  const atMs = dueInstantMs(item.timezone, due);
  return createTransaction(ctx, {
    amount: formatCents(item.amount),
    type: item.kind === 'income' ? 'credit' : 'debit',
    counterpartyName: item.name,
    categoryId: item.category_id,
    note: item.note,
    transactionAt: { ms: atMs, iso: new Date(atMs).toISOString() },
    // The due date is the day the money belongs to, whatever zone the instant is read in.
    localDate: dateKey(due),
    detectedVia: 'manual',
    recurringItemId: item.id,
    recurringOccurrence: dateKey(due),
  });
}

export interface PostRunResult {
  /** Occurrences that were due (posting instant passed, no live row, no skip). */
  due: number;
  posted: number;
}

/**
 * Store the cache of an item: its `next_due_date` (the first occurrence still owed) and the lead-day reminder instant of that
 * occurrence (only items that opted in read the user's reminder settings). Skipped when nothing changed.
 */
export async function cacheNextDue(db: Db, item: RecurringRow, next: LocalDate, nowMs: number): Promise<void> {
  const nextDue = dateKey(next);
  const nextRemind = item.remind_lead_days === null ? null : nextRemindIso({ ...item, next_due_date: nextDue }, settingsFromRow(await fetchByUserId(db, item.user_id)), nowMs);
  if (nextDue === item.next_due_date && nextRemind === item.next_remind_at) return;
  await repo.setNextDue(db, item.id, item.updated_at, nextDue, nextRemind);
}

/**
 * Cron entry (every 5 minutes): for every active item whose cached next due date has arrived, posts EVERY occurrence that is due
 * (06:00 local passed) and has neither a live row nor a skip, since the item's start or resume, oldest first: a cron that was down
 * or an edit that moved the day loses nothing, and a deleted posting (a skip) is never re-posted. The facts decide, not a pointer:
 * `next_due_date` is only the cache recomputed afterwards. Idempotent: the occurrence's unique identity blocks a second row. At
 * most `POST_BATCH` postings per run (a backlog drains run by run); one failing item never stops the others.
 */
export async function postDueRecurring(env: Bindings, nowMs: number = Date.now()): Promise<PostRunResult> {
  const db = env.DB;
  const items = await repo.listDue(db, new Date(nowMs + MAX_OFFSET_MS).toISOString().slice(0, 10), POST_BATCH);
  const config = getConfig(env);
  const storage = mediaStore(env);
  let posted = 0;
  let due = 0;
  for (const item of items) {
    if (due >= POST_BATCH) break;
    try {
      const taken = await repo.listOccurrences(db, item.user_id, item.id);
      const plan = planOccurrences(item, item.timezone, item.starts_on ?? item.next_due_date, taken, nowMs, POST_BATCH - due);
      const publish: TxContext['publish'] = (events) => publishChanges(env, item.user_id, events);
      const ctx: TxContext = {
        db,
        storage,
        userId: item.user_id,
        media: { expiresIn: config.signedUrlTtlSeconds },
        publish,
        // The cron has no response to protect: the alerts are reconciled before the cache moves on.
        afterWrite: (months) => reconcileUserBudgetAlerts(db, item.user_id, months, { publish, timezone: item.timezone, nowMs }),
      };
      for (const occurrence of plan.due) {
        due += 1;
        if ((await postOccurrence(ctx, item, occurrence)).kind === 'created') posted += 1;
      }
      await cacheNextDue(db, item, plan.next, nowMs);
    } catch (err) {
      log.error('recurring_post_failed', { id: item.id, err });
    }
  }
  if (due > 0) log.info('recurring_posted', { due, posted });
  return { due, posted };
}
