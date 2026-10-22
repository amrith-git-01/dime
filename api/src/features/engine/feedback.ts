import { batch, first, newId, stmt } from '../../core/db';
import type { Db } from '../../core/db';
import { ValidationError } from '../../core/errors';
import { localDate, parseTimezone } from '../../core/timezone';
import { fetchMetaByIds } from '../categories/repository';
import { CONFIRM_BOOST, updateEvidence } from './confidence';
import { markEngineDirty } from './dirty';
import { unmerge } from './labeller';
import { resolveTimezone } from './patterns';
import type { FeedbackRequest } from './schemas';

const unknownTarget = () => new ValidationError('Unknown prediction.');

/**
 * What the user told us about a prediction (docs/PREDICTIVE-ENGINE-PLAN.md §6.1), applied for that user only; the target must be
 * one of theirs (422 otherwise). The latest answer per target is kept in `prediction_feedback` (one row per target, and per month for
 * `category_watch`), which is how a dismissal hides a card; sending the same verdict again changes nothing, so a replayed request
 * cannot pile up confidence. Boosts decay the old evidence first (`updateEvidence`).
 *   payee                   confirm: alpha + 3.   dismiss: the payee is suppressed (no more likely spends from it).
 *   subscription_candidate  confirm: it is a subscription (the user's word) and alpha + 3.   dismiss: "not a subscription", a habit.
 *   unusual_txn             one_off / not_one_off: the user's label on the transaction (it beats the model's) and a rebuild.   dismiss: hide.
 *   category_watch          dismiss: hide it for the current local month only.
 *   payee_merge             dismiss: the model merged two payees wrongly; split them again.
 */
export async function applyFeedback(db: Db, userId: string, input: FeedbackRequest, nowMs: number = Date.now()): Promise<void> {
  const { targetKind, verdict } = input;
  const targetId = targetKind === 'category_watch' ? input.targetId.toLowerCase() : input.targetId;
  const now = new Date(nowMs).toISOString();
  const effects: D1PreparedStatement[] = [];
  let month = '';
  if (targetKind === 'category_watch') {
    const { year, month: m } = localDate(await timezoneFor(db, userId, input.timezone), nowMs);
    month = `${year}-${String(m).padStart(2, '0')}`;
  }
  // The same verdict again (a retry, a double tap) is a no-op: its effects were applied the first time.
  const prior = await first<{ verdict: string }>(
    db,
    'SELECT verdict FROM prediction_feedback WHERE user_id = ? AND target_kind = ? AND target_id = ? AND month = ?',
    [userId, targetKind, targetId, month],
  );
  const repeated = prior?.verdict === verdict;
  let rebuild = false;

  switch (targetKind) {
    case 'payee':
    case 'subscription_candidate': {
      const pattern = await first<{ kind: string; alpha: number; beta: number }>(db, 'SELECT kind, alpha, beta FROM payee_patterns WHERE user_id = ? AND payee_key = ?', [userId, targetId]);
      if (!pattern || (targetKind === 'subscription_candidate' && pattern.kind !== 'subscription' && pattern.kind !== 'habit')) throw unknownTarget();
      const where = 'WHERE user_id = ? AND payee_key = ?';
      const boosted = updateEvidence(pattern.alpha, pattern.beta, CONFIRM_BOOST, 0);
      if (targetKind === 'payee') {
        effects.push(
          verdict === 'confirm'
            ? stmt(db, `UPDATE payee_patterns SET alpha = ?, beta = ? ${where}`, [boosted.alpha, boosted.beta, userId, targetId])
            : stmt(db, `UPDATE payee_patterns SET suppressed = 1 ${where}`, [userId, targetId]),
        );
      } else {
        effects.push(
          verdict === 'confirm'
            ? stmt(db, `UPDATE payee_patterns SET kind = 'subscription', kind_source = 'user', alpha = ?, beta = ? ${where}`, [boosted.alpha, boosted.beta, userId, targetId])
            : stmt(db, `UPDATE payee_patterns SET kind = 'habit', kind_source = 'user' ${where}`, [userId, targetId]),
        );
      }
      break;
    }
    case 'unusual_txn': {
      const txn = await first<{ id: string }>(db, 'SELECT id FROM transactions WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [targetId, userId]);
      if (!txn) throw unknownTarget();
      if (verdict !== 'dismiss') {
        // The user always wins over the model's label (and over a rule's).
        effects.push(
          stmt(
            db,
            `INSERT INTO txn_labels (transaction_id, user_id, one_off, source, labelled_at) VALUES (?, ?, ?, 'user', ?)
             ON CONFLICT (transaction_id) DO UPDATE SET one_off = excluded.one_off, source = 'user', labelled_at = excluded.labelled_at`,
            [targetId, userId, verdict === 'one_off' ? 1 : 0, now],
          ),
        );
        rebuild = true;
      }
      break;
    }
    case 'category_watch':
      if (!(await fetchMetaByIds(db, [targetId], userId)).has(targetId)) throw unknownTarget();
      break;
    case 'payee_merge':
      if (!repeated && !(await unmerge(db, userId, targetId))) throw unknownTarget();
      break;
  }
  if (repeated) return;

  await batch(db, [
    ...effects,
    stmt(
      db,
      `INSERT INTO prediction_feedback (id, user_id, target_kind, target_id, verdict, month, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, target_kind, target_id, month) DO UPDATE SET verdict = excluded.verdict, created_at = excluded.created_at`,
      [newId(), userId, targetKind, targetId, verdict, month, now],
    ),
  ]);
  if (rebuild) await markEngineDirty(db, userId);
}

async function timezoneFor(db: Db, userId: string, requested: string | undefined): Promise<string> {
  return requested ? parseTimezone(requested) : resolveTimezone(db, userId);
}
