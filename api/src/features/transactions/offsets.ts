import * as z from 'zod';

import { all, first, newId, nowIso, run } from '../../core/db';
import { decimalToCents, formatCents } from '../../core/decimal';
import { isUniqueViolation } from '../../core/db-errors';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import { isoUtc } from '../../core/timestamps';
import { uuidString } from '../../core/validation';
import { emit } from '../realtime/publish';
import { updated as changed } from '../realtime/events';
import { ledgerSelect } from './ledger';
import * as repo from './repository';
import { amountInput } from './schemas';
import type { TransactionResponse, TransactionRow } from './schemas';
import { afterSpendWrite, enrichRows } from './service';
import type { TxContext } from './service';

/**
 * Paybacks (docs/MONEY-MODEL-FIX-PLAN.md R1): an offset links part of a credit to a debit it pays back (a friend's share of a
 * hotel, a refund). A debit's real cost is its amount minus its offsets, counted in the debit's own month; the linked part of
 * the credit is not income. The credit's `kind` is never changed by linking: its unlinked remainder stays income (`income`) or
 * lowers spend in its own category and month (`payback`). Both rows must be live, the credit's kind is `income` or `payback`,
 * the debit's is `spend`, and neither side can be linked for more than its amount (checked inside the insert, so two requests
 * cannot both fit).
 */

export const offsetCreateSchema = z.object({
  credit_id: uuidString,
  debit_id: uuidString,
  /** Rupees of the credit that pay back the debit. */
  amount: amountInput,
});
export type OffsetCreateBody = z.output<typeof offsetCreateSchema>;

export interface OffsetResponse {
  id: string;
  credit_id: string;
  debit_id: string;
  amount: string;
  created_at: string;
}

export interface OffsetListResponse {
  /** Each link with the other side of it (the debit when asked about a credit, and the other way round). */
  items: (OffsetResponse & { transaction: TransactionResponse })[];
  offset_total: string;
  effective_amount: string;
}

export interface PaybackCandidate {
  transaction: TransactionResponse;
  /** What is still unlinked on that row (rupees). */
  remaining: string;
  /** Same payee as the row asked about. */
  payee_match: boolean;
}

const WINDOW_DAYS = 45;
const DAY_MS = 86_400_000;
const NOT_FOUND = 'Transaction not found.';
const OFFSET_NOT_FOUND = 'Payback link not found.';
const ALREADY_LINKED = 'These two transactions are already linked. Remove the link to change its amount.';

interface OffsetDbRow {
  id: string;
  credit_id: string;
  debit_id: string;
  amount: number;
  created_at: string;
}

const toOffset = (row: OffsetDbRow): OffsetResponse => ({
  id: row.id,
  credit_id: row.credit_id,
  debit_id: row.debit_id,
  amount: formatCents(row.amount),
  created_at: isoUtc(row.created_at),
});

/** `GET /transactions/:id/offsets`: the live links of a transaction (as the credit or as the debit), each with the other side. */
export async function listOffsets(ctx: TxContext, id: string): Promise<OffsetListResponse> {
  const row = await repo.fetchActive(ctx.db, ctx.userId, id);
  if (!row) throw new NotFoundError(NOT_FOUND);
  const links = await all<OffsetDbRow>(
    ctx.db,
    `SELECT o.id, o.credit_id, o.debit_id, o.amount, o.created_at FROM transaction_offsets o
     JOIN transactions p ON p.id = CASE WHEN o.credit_id = ? THEN o.debit_id ELSE o.credit_id END AND p.deleted_at IS NULL
     WHERE o.user_id = ? AND (o.credit_id = ? OR o.debit_id = ?) ORDER BY o.created_at, o.id`,
    [row.id, ctx.userId, row.id, row.id],
  );
  const otherIds = links.map((l) => (l.credit_id === row.id ? l.debit_id : l.credit_id));
  const others = new Map((await enrichRows(ctx, await repo.fetchActiveMany(ctx.db, ctx.userId, otherIds))).map((t) => [t.id, t]));
  const total = links.reduce((sum, l) => sum + l.amount, 0);
  return {
    items: links.flatMap((l) => {
      const other = others.get(l.credit_id === row.id ? l.debit_id : l.credit_id);
      return other ? [{ ...toOffset(l), transaction: other }] : [];
    }),
    offset_total: formatCents(total),
    effective_amount: formatCents(decimalToCents(row.amount) - total),
  };
}

/** Both rows of a link, checked: live, the caller's, the right direction and kind. */
async function loadPair(ctx: TxContext, creditId: string, debitId: string): Promise<{ credit: TransactionRow; debit: TransactionRow }> {
  if (creditId.toLowerCase() === debitId.toLowerCase()) throw new ValidationError('A transaction cannot pay itself back.');
  const [credit, debit] = await Promise.all([repo.fetchActive(ctx.db, ctx.userId, creditId), repo.fetchActive(ctx.db, ctx.userId, debitId)]);
  if (!credit || !debit) throw new NotFoundError(NOT_FOUND);
  if (credit.type !== 'credit' || (credit.kind !== 'income' && credit.kind !== 'payback')) {
    throw new ValidationError('Only money received (income or a payback) can pay back a spend.');
  }
  if (debit.type !== 'debit' || debit.kind !== 'spend') throw new ValidationError('Only a spend can be paid back.');
  return { credit, debit };
}

/** `POST /transactions/offsets`: link (part of) a credit to a debit. The credit's kind is left alone. */
export async function createOffset(ctx: TxContext, body: OffsetCreateBody): Promise<OffsetResponse> {
  const { credit, debit } = await loadPair(ctx, body.credit_id, body.debit_id);
  const cents = decimalToCents(body.amount);
  if (await first(ctx.db, 'SELECT id FROM transaction_offsets WHERE credit_id = ? AND debit_id = ?', [credit.id, debit.id])) {
    throw new ConflictError(ALREADY_LINKED);
  }
  const id = newId();
  const now = nowIso();
  let inserted: { id: string }[];
  try {
    // The capacity of both sides is checked in the INSERT itself (live links only), so concurrent requests cannot overfill.
    // Linking never touches the credit's kind: what it does is computed from its links (ledger.ts).
    inserted = await all<{ id: string }>(
      ctx.db,
      `INSERT INTO transaction_offsets (id, user_id, credit_id, debit_id, amount, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6
       WHERE ?5 + COALESCE((SELECT SUM(o.amount) FROM transaction_offsets o JOIN transactions p ON p.id = o.credit_id AND p.deleted_at IS NULL WHERE o.debit_id = ?4), 0)
               <= (SELECT amount FROM transactions WHERE id = ?4)
         AND ?5 + COALESCE((SELECT SUM(o.amount) FROM transaction_offsets o JOIN transactions p ON p.id = o.debit_id AND p.deleted_at IS NULL WHERE o.credit_id = ?3), 0)
               <= (SELECT amount FROM transactions WHERE id = ?3)
       RETURNING id`,
      [id, ctx.userId, credit.id, debit.id, cents, now],
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(ALREADY_LINKED); // a concurrent request linked the pair first
    throw err;
  }
  if (inserted.length === 0) {
    throw new ValidationError('That amount is more than is left to pay back on the spend, or left on the money received.');
  }
  await announce(ctx, credit.id, debit.id);
  return { id, credit_id: credit.id, debit_id: debit.id, amount: formatCents(cents), created_at: now };
}

/** `DELETE /transactions/offsets/:id`: unlink. The credit's unlinked amount follows its own kind again (nothing is rewritten). */
export async function deleteOffset(ctx: TxContext, offsetId: string): Promise<void> {
  const link = await first<OffsetDbRow>(
    ctx.db,
    'SELECT id, credit_id, debit_id, amount, created_at FROM transaction_offsets WHERE id = ? AND user_id = ?',
    [offsetId.toLowerCase(), ctx.userId],
  );
  if (!link) throw new NotFoundError(OFFSET_NOT_FOUND);
  await run(ctx.db, 'DELETE FROM transaction_offsets WHERE id = ? AND user_id = ?', [link.id, ctx.userId]);
  await announce(ctx, link.credit_id, link.debit_id);
}

/** After a link changed: tell the user's devices about both rows and re-check the budget alerts of their months. */
async function announce(ctx: TxContext, creditId: string, debitId: string): Promise<void> {
  const rows = await repo.fetchActiveMany(ctx.db, ctx.userId, [creditId, debitId]);
  await emit(ctx.publish, rows.map((row) => changed('transactions', row)));
  await afterSpendWrite(ctx, rows);
}

/**
 * `GET /transactions/:id/payback-candidates`. For a credit: live spends in the 45 days before it (and a day after) whose
 * unlinked amount is at least what is left on the credit or within 10% of it. For a debit: unlinked credits in the 45 days after
 * it (and a day before). Same payee first, then the closest amount, then the most recent. At most 20.
 */
export async function paybackCandidates(ctx: TxContext, id: string): Promise<{ items: PaybackCandidate[] }> {
  const row = await repo.fetchActive(ctx.db, ctx.userId, id);
  if (!row) throw new NotFoundError(NOT_FOUND);
  const isCredit = row.type === 'credit';
  if (isCredit ? row.kind !== 'income' && row.kind !== 'payback' : row.kind !== 'spend') return { items: [] };

  const atMs = Date.parse(row.transaction_at);
  const [from, to] = isCredit ? [atMs - WINDOW_DAYS * DAY_MS, atMs + DAY_MS] : [atMs - DAY_MS, atMs + WINDOW_DAYS * DAY_MS];
  const kinds = isCredit ? "t.kind = 'spend'" : "t.kind IN ('income', 'payback')";
  const [self, rows] = await Promise.all([
    all<{ effective_cents: number; payee_key: string }>(
      ctx.db,
      `SELECT l.effective_cents AS effective_cents, l.payee_key AS payee_key FROM (${ledgerSelect('t.id = ? AND t.user_id = ?')}) l`,
      [row.id, ctx.userId],
    ),
    all<{ id: string; effective_cents: number; payee_key: string; transaction_at: string }>(
      ctx.db,
      `SELECT l.id AS id, l.effective_cents AS effective_cents, l.payee_key AS payee_key, l.transaction_at AS transaction_at
       FROM (${ledgerSelect(`t.user_id = ? AND t.deleted_at IS NULL AND t.id <> ? AND ${kinds} AND t.transaction_at >= ? AND t.transaction_at <= ?`)}) l
       WHERE l.effective_cents > 0`,
      [ctx.userId, row.id, new Date(from).toISOString(), new Date(to).toISOString()],
    ),
  ]);
  const remaining = self[0]?.effective_cents ?? 0;
  const payee = self[0]?.payee_key ?? '';
  if (remaining <= 0) return { items: [] };

  // For a credit: a spend that still owes at least what is left of the credit (or within 10% of it). For a debit: a credit
  // whose unlinked part is at most what the spend still owes (or within 10%).
  const fits = (candidate: number) => (isCredit ? candidate >= remaining : candidate <= remaining) || Math.abs(candidate - remaining) * 10 <= remaining;
  const ranked = rows
    .filter((r) => fits(r.effective_cents))
    .sort(
      (a, b) =>
        Number(b.payee_key === payee) - Number(a.payee_key === payee) ||
        Math.abs(a.effective_cents - remaining) - Math.abs(b.effective_cents - remaining) ||
        (a.transaction_at < b.transaction_at ? 1 : -1),
    )
    .slice(0, 20);

  const responses = new Map(
    (
      await enrichRows(
        ctx,
        await repo.fetchActiveMany(
          ctx.db,
          ctx.userId,
          ranked.map((r) => r.id),
        ),
      )
    ).map((t) => [t.id, t]),
  );
  return {
    items: ranked.flatMap((r) => {
      const transaction = responses.get(r.id);
      return transaction ? [{ transaction, remaining: formatCents(r.effective_cents), payee_match: r.payee_key === payee }] : [];
    }),
  };
}
