import type { Db } from '../../core/db';
import { fetchMetaByIds } from '../categories/repository';
import { fetchByUserId } from '../user-settings/repository';
import { settingsFromRow } from '../user-settings/snapshot';
import type { UserSettings } from '../user-settings/snapshot';
import { evaluateAfterDebit } from './budget-evaluator';
import { AUTO_DETECTED, bodyForAutoTx, createEmitter, titleForAutoTx } from './emitter';
import type { PushSender } from './emitter';
import type { Publish } from '../realtime/events';

export interface AfterInsertInput {
  userId: string;
  timezone: string;
  transactionId: string;
  type: 'debit' | 'credit';
  /** `manual` | `voice` | `scan`; auto-detected sources get a `transaction_auto` notification. */
  detectedVia: string;
  /** Instant of the transaction (epoch ms), used to pick the budget periods. */
  transactionAtMs: number;
  categoryId: string | null;
  amount: number | string;
  counterpartyName: string | null;
  /** Skip the user_settings read when the caller already has the snapshot. */
  settings?: UserSettings;
  pushSend?: PushSender;
  /** Live-update broadcast to the user's open sockets (new notification rows). */
  publish?: Publish | undefined;
}

/**
 * Everything that follows a new transaction row, in the order the Python backend did it: budget
 * threshold notifications for debits, then the "added" notification for auto-captured rows. Nothing
 * here affects the HTTP response, so API handlers run it with `defer`/`waitUntil` and the R3 queue
 * consumer calls it after inserting a captured transaction.
 */
export async function notifyAfterInsert(db: Db, input: AfterInsertInput): Promise<void> {
  const autoDetected = AUTO_DETECTED.has(input.detectedVia);
  if (input.type !== 'debit' && !autoDetected) return; // nothing to notify: skip the settings read

  const settings = input.settings ?? settingsFromRow(await fetchByUserId(db, input.userId));
  const emitter = createEmitter(db, input.userId, settings, input.pushSend, input.publish);

  if (input.type === 'debit') {
    await evaluateAfterDebit(db, emitter, settings, {
      userId: input.userId,
      timezone: input.timezone,
      transactionAtMs: input.transactionAtMs,
      categoryId: input.categoryId,
    });
  }

  if (autoDetected) {
    const category = input.categoryId ? (await fetchMetaByIds(db, [input.categoryId], input.userId)).get(input.categoryId.toLowerCase()) : undefined;
    await emitter.transactionAuto({
      transactionId: input.transactionId,
      title: titleForAutoTx(input.amount),
      body: bodyForAutoTx({ merchant: input.counterpartyName, category: category?.name ?? null }),
    });
  }
}
