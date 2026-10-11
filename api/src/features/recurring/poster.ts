import { formatCents } from '../../core/decimal';
import type { Bindings } from '../../core/env';
import { getConfig } from '../../core/env';
import { log } from '../../core/logging';
import { dateKey } from '../../core/timezone';
import type { LocalDate } from '../../core/timezone';
import { mediaStore } from '../media/storage';
import { notifyAfterInsert } from '../notifications/after-insert';
import { publishChanges } from '../realtime/publish';
import { createTransaction } from '../transactions/service';
import type { CreateResult, TxContext } from '../transactions/service';
import * as repo from './repository';
import { dueInstantMs, nextAfter, parseDateKey } from './schedule';
import type { RecurringRow } from './schemas';

/** Items posted per cron run (oldest due first); the rest wait for the next 5-minute run. */
// ponytail: 50 per run is plenty for a personal-finance app and keeps one run well inside D1's per-invocation subrequest limit;
// if it ever backs up, raise it (and the cap) or fan out onto a queue like the email digest.
export const POST_BATCH = 50;
/** Largest UTC offset is +14:00, so a local date can be one day ahead of the UTC date. */
const MAX_OFFSET_MS = 14 * 3_600_000;

/** What the post needs from its caller: `later` runs the after-insert work (route: waitUntil, cron: awaited). */
export type Later = (work: Promise<void>) => void | Promise<void>;

/**
 * Creates the transaction of one occurrence: a normal manual-source row at 06:00 local of `due`, keyed by
 * `payment_hash = recurring:<item>:<date>` so posting the same occurrence twice returns the existing row.
 */
export async function postOccurrence(ctx: TxContext, item: RecurringRow, due: LocalDate, later: Later): Promise<CreateResult> {
  const atMs = dueInstantMs(item.timezone, due);
  const type = item.kind === 'income' ? 'credit' : 'debit';
  const amount = formatCents(item.amount);
  const result = await createTransaction(ctx, {
    amount,
    type,
    counterpartyName: item.name,
    categoryId: item.category_id,
    note: item.note,
    transactionAt: { ms: atMs, iso: new Date(atMs).toISOString() },
    detectedVia: 'manual',
    paymentHash: `recurring:${item.id}:${dateKey(due)}`,
    recurringItemId: item.id,
  });
  if (result.kind === 'created' && type === 'debit') {
    // Same follow-up as a manual debit: budget threshold notifications.
    await later(
      notifyAfterInsert(ctx.db, {
        userId: item.user_id,
        timezone: item.timezone,
        transactionId: result.id,
        type,
        detectedVia: 'manual',
        transactionAtMs: atMs,
        categoryId: result.categoryId,
        amount,
        counterpartyName: item.name,
        publish: ctx.publish,
      }).catch((err: unknown) => log.warn('recurring_notify_failed', { id: item.id, err: String(err) })),
    );
  }
  return result;
}

export interface PostRunResult {
  due: number;
  posted: number;
}

/**
 * Cron entry (every 5 minutes): posts every active item whose next due date, at 06:00 in the item's timezone, has
 * arrived, then moves it ONE period on. Idempotent: the occurrence's payment hash blocks a second row, and the
 * advance is conditional on the date just posted. At most one period per item per run (a backlog drains run by run);
 * one failing item never stops the others.
 */
export async function postDueRecurring(env: Bindings, nowMs: number = Date.now()): Promise<PostRunResult> {
  const db = env.DB;
  const items = await repo.listDue(db, new Date(nowMs + MAX_OFFSET_MS).toISOString().slice(0, 10), POST_BATCH);
  const config = getConfig(env);
  const storage = mediaStore(env);
  let posted = 0;
  let due = 0;
  for (const item of items) {
    try {
      const dueDate = parseDateKey(item.next_due_date);
      if (dueInstantMs(item.timezone, dueDate) > nowMs) continue; // the UTC pre-filter is a day wider than the local clock
      due += 1;
      const ctx: TxContext = {
        db,
        storage,
        userId: item.user_id,
        media: { expiresIn: config.signedUrlTtlSeconds },
        publish: (events) => publishChanges(env, item.user_id, events),
      };
      const result = await postOccurrence(ctx, item, dueDate, (work) => work);
      if (result.kind === 'created') posted += 1;
      await repo.advance(db, item.id, item.next_due_date, dateKey(nextAfter(item, dueDate)));
    } catch (err) {
      log.error('recurring_post_failed', { id: item.id, err });
    }
  }
  if (due > 0) log.info('recurring_posted', { due, posted });
  return { due, posted };
}
