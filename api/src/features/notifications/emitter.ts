import { toCents } from '../../core/decimal';
import { log } from '../../core/logging';
import type { Db } from '../../core/db';
import { inserted as insertedEvent } from '../realtime/events';
import type { Publish } from '../realtime/events';
import { emit as emitChanges } from '../realtime/publish';
import { deleteByToken, listTokens } from '../push-tokens/repository';
import type { UserSettings } from '../user-settings/snapshot';
import { sendExpoPush } from './push';
import { insertDeduped } from './repository';
import type { NewNotification, NotificationRow } from './schemas';

/** Capture sources whose transactions announce themselves with a `transaction_auto` notification. */
export const AUTO_DETECTED: ReadonlySet<string> = new Set(['scan', 'voice']);

/** "₹20,000" / "₹1,234.50": whole amounts drop ".00" (Python `format_inr`, western digit grouping). */
export function formatInrCents(totalCents: number): string {
  const cents = Math.abs(totalCents);
  const whole = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = cents % 100;
  return `${totalCents < 0 ? '-' : ''}₹${whole}${frac === 0 ? '' : `.${String(frac).padStart(2, '0')}`}`;
}

export function formatInr(value: number | string): string {
  return formatInrCents(toCents(value));
}

export function titleForAutoTx(amount: number | string): string {
  return `${formatInr(amount)} added`;
}

export function bodyForAutoTx(row: { merchant?: string | null; counterpartyName?: string | null; category?: string | null }): string {
  const merchant = (row.merchant || row.counterpartyName || '').trim() || 'Transaction';
  const category = row.category?.trim();
  return category ? `${merchant} · ${category}` : merchant;
}

export type PushSender = typeof sendExpoPush;

export interface Emitter {
  transactionAuto(input: { transactionId: string; title: string; body: string }): Promise<void>;
  captureFailed(input: { source: 'scan'; title: string; body: string; dayKey: string }): Promise<void>;
  budgetThreshold(input: { scope: 'monthly'; periodKey: string; threshold: number; title: string; body: string }): Promise<void>;
  categoryBudgetThreshold(input: { categoryId: string; periodKey: string; threshold: number; title: string; body: string }): Promise<void>;
}

/**
 * Notification rows on product events, plus a push for each NEW row. Inserts are deduped on
 * `(user_id, dedupe_key)`: a conflict inserts nothing and sends no push. Port of backend
 * `features/notifications/emitter.py`; R3's queue consumer reuses it after capture inserts.
 */
export function createEmitter(
  db: Db,
  userId: string,
  settings: UserSettings,
  pushSend: PushSender = sendExpoPush,
  publish?: Publish,
): Emitter {
  async function maybePush(row: NotificationRow): Promise<void> {
    if (!settings.device_notifications_enabled) return;
    try {
      const tokens = await listTokens(db, userId);
      if (tokens.length === 0) return;
      await pushSend({
        tokens,
        title: String(row.title || ''),
        body: String(row.body || ''),
        data: {
          notification_id: String(row.id ?? ''),
          kind: row.kind,
          action_type: row.action_type,
          action_transaction_id: row.action_transaction_id,
        },
        onInvalidToken: (token) => deleteByToken(db, token),
      });
    } catch (err) {
      log.error('push_after_notification_insert_failed', { err, userId });
    }
  }

  async function emit(row: Omit<NewNotification, 'user_id'>): Promise<void> {
    const inserted = await insertDeduped(db, { user_id: userId, ...row });
    if (!inserted) return;
    // Live update first so the in-app bell/list refresh at once; push is best effort after it.
    await emitChanges(publish, [insertedEvent('notifications', inserted)]);
    await maybePush(inserted);
  }

  return {
    async transactionAuto({ transactionId, title, body }) {
      if (!settings.auto_capture_alerts_enabled) return;
      await emit({
        kind: 'transaction_auto',
        title,
        body,
        action_type: 'transaction_detail',
        action_transaction_id: transactionId,
        dedupe_key: `transaction_auto:${transactionId}`,
      });
    },
    async captureFailed({ source, title, body, dayKey }) {
      if (!settings.capture_failed_alerts_enabled) return;
      await emit({
        kind: 'capture_failed',
        title,
        body,
        action_type: 'manual_add',
        action_transaction_id: null,
        dedupe_key: `capture_failed:${source}:${dayKey}`,
      });
    },
    async budgetThreshold({ scope, periodKey, threshold, title, body }) {
      // Scope gating lives in the evaluator; the emitter inserts whenever it is called.
      await emit({
        kind: 'budget_threshold',
        title,
        body,
        action_type: 'home',
        action_transaction_id: null,
        dedupe_key: `budget:${scope}:${threshold}:${periodKey}`,
      });
    },
    async categoryBudgetThreshold({ categoryId, periodKey, threshold, title, body }) {
      await emit({
        kind: 'budget_threshold',
        title,
        body,
        action_type: 'home',
        action_transaction_id: null,
        dedupe_key: `budget:category:${categoryId}:${threshold}:${periodKey}`,
      });
    },
  };
}
