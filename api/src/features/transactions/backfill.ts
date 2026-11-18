import { all, batch, chunks, stmt } from '../../core/db';
import type { Db } from '../../core/db';
import { log } from '../../core/logging';
import { dateKey, localDate } from '../../core/timezone';
import { normalizedOrNull, payeeKey } from './dedupe';
import { resolveUserTimezone } from '../user-settings/service';

/**
 * Local-date backfill (docs/MONEY-MODEL-FIX-PLAN.md R5). Migration 0017 filled `local_date` / `month_key` in SQL for users on
 * fixed-offset zones; every row of a user on a DST zone (and any row an older Worker wrote during the deploy window) is filled
 * here, a batch per cron tick, each in its owner's stored timezone. Until the backfill reaches a row the ledger places it by its
 * instant in IST. Costs one indexed read of nothing once everything is filled.
 */

/** Rows per run (the 5-minute cron): a backlog drains over a few ticks. */
export const BACKFILL_BATCH = 500;
/** Statements per D1 batch. */
const STATEMENTS_PER_BATCH = 100;

/** Fill `local_date` / `month_key` of up to `limit` rows that lack them; returns how many were filled. Never throws. */
export async function backfillLocalDates(db: Db, limit: number = BACKFILL_BATCH): Promise<number> {
  try {
    const rows = await all<{ id: string; user_id: string; transaction_at: string }>(
      db,
      'SELECT id, user_id, transaction_at FROM transactions WHERE local_date IS NULL LIMIT ?',
      [limit],
    );
    if (rows.length === 0) return 0;

    const zones = new Map<string, string>();
    const statements: D1PreparedStatement[] = [];
    for (const row of rows) {
      let tz = zones.get(row.user_id);
      if (tz === undefined) {
        tz = await resolveUserTimezone(db, row.user_id);
        zones.set(row.user_id, tz);
      }
      const ms = Date.parse(row.transaction_at);
      // An unreadable instant would never leave the queue: file it under its own text so the backfill moves on.
      const day = Number.isNaN(ms) ? row.transaction_at.slice(0, 10) : dateKey(localDate(tz, ms));
      statements.push(stmt(db, 'UPDATE transactions SET local_date = ?, month_key = ? WHERE id = ? AND local_date IS NULL', [day, day.slice(0, 7), row.id]));
    }
    for (const part of chunks(statements, STATEMENTS_PER_BATCH)) await batch(db, part);
    log.info('local_date_backfilled', { rows: rows.length });
    return rows.length;
  } catch (err) {
    log.warn('local_date_backfill_failed', { err: String(err) });
    return 0;
  }
}

/** Rows per batch and batches per run of the payee-key repair (a handful of rows is normal; the loop only matters for a first run). */
const PAYEE_BATCH = 200;
const PAYEE_MAX_BATCHES = 5;

/**
 * Payee keys of names the old ASCII-only normaliser could not read (Tamil, Hindi, Arabic names were all filed under 'unknown'):
 * recomputed with the Unicode rule every new row uses. Rows whose name has no letter or digit at all stay 'unknown' (a keyset
 * cursor moves past them within the run). Reads the partial index `transactions_payee_unknown_idx`, so it costs nothing once
 * done. `updated_at` is left alone (this is not a user edit: it must not make a device's copy stale). Never throws; returns the
 * rows fixed.
 */
export async function backfillPayeeKeys(db: Db): Promise<number> {
  let fixed = 0;
  try {
    let after = '';
    for (let batchNo = 0; batchNo < PAYEE_MAX_BATCHES; batchNo += 1) {
      const rows = await all<{ id: string; counterparty_name: string }>(
        db,
        "SELECT id, counterparty_name FROM transactions WHERE payee_key = 'unknown' AND counterparty_name <> '' AND id > ? ORDER BY id LIMIT ?",
        [after, PAYEE_BATCH],
      );
      if (rows.length === 0) break;
      const statements: D1PreparedStatement[] = [];
      for (const row of rows) {
        const normalized = normalizedOrNull(row.counterparty_name);
        const key = payeeKey(normalized, row.counterparty_name);
        if (key === 'unknown') continue;
        statements.push(stmt(db, "UPDATE transactions SET payee_key = ?, counterparty_normalized = COALESCE(counterparty_normalized, ?) WHERE id = ? AND payee_key = 'unknown'", [key, normalized, row.id]));
      }
      for (const part of chunks(statements, STATEMENTS_PER_BATCH)) await batch(db, part);
      fixed += statements.length;
      after = rows[rows.length - 1]?.id ?? after;
      if (rows.length < PAYEE_BATCH) break;
    }
    if (fixed > 0) log.info('payee_keys_backfilled', { rows: fixed });
  } catch (err) {
    log.warn('payee_key_backfill_failed', { err: String(err) });
  }
  return fixed;
}
