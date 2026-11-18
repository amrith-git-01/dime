import { all, placeholders } from '../../core/db';
import type { Db } from '../../core/db';
import { log } from '../../core/logging';
import { storedMediaKey } from '../media/refs';
import type { MediaStore } from '../media/storage';

const DAY_MS = 86_400_000;
/** A deleted transaction can be restored (the app's undo, a support request) for this long, then it and its media are gone. */
export const DELETED_RETENTION_DAYS = 30;
/** Transactions per batch: each one may hold two R2 objects, and the delete statement's `id in (...)` list stays short. */
const PURGE_BATCH = 50;
/** Batches per run, so a large backlog drains over several hourly runs instead of one long one. */
const PURGE_MAX_BATCHES = 10;

interface DeletedRow {
  id: string;
  receipt_url: string | null;
  voice_url: string | null;
}

/**
 * Hourly purge of soft-deleted transactions older than 30 days, with their receipt and voice objects in R2. A batch removes the
 * media first and the rows after: a row whose media could not be deleted stays (the next run retries it), so no object is orphaned
 * by a transient R2 failure. The rows' paybacks, reminder payments and notification links go with them (foreign keys). Never
 * throws: the next hour retries. Returns the transactions purged.
 */
export async function purgeDeletedTransactions(db: Db, storage: MediaStore, nowMs: number = Date.now()): Promise<number> {
  const cutoff = new Date(nowMs - DELETED_RETENTION_DAYS * DAY_MS).toISOString();
  let purged = 0;
  try {
    for (let batch = 0; batch < PURGE_MAX_BATCHES; batch += 1) {
      const rows = await all<DeletedRow>(
        db,
        'SELECT id, receipt_url, voice_url FROM transactions WHERE deleted_at IS NOT NULL AND deleted_at < ? ORDER BY deleted_at LIMIT ?',
        [cutoff, PURGE_BATCH],
      );
      if (rows.length === 0) break;
      const removable: string[] = [];
      for (const row of rows) {
        const keys = [row.receipt_url, row.voice_url].flatMap((stored) => (stored ? [storedMediaKey(stored)] : [])).filter((key): key is string => key !== null);
        try {
          await Promise.all(keys.map((key) => storage.bucket.delete(key)));
          removable.push(row.id);
        } catch (err) {
          log.warn('transaction_purge_media_failed', { id: row.id, err: String(err) });
        }
      }
      if (removable.length > 0) {
        // RETURNING counts the transactions themselves: `changes` would include the rows the foreign keys cascade to.
        purged += (await all<{ id: string }>(db, `DELETE FROM transactions WHERE id IN (${placeholders(removable.length)}) RETURNING id`, removable)).length;
      }
      if (removable.length < rows.length || rows.length < PURGE_BATCH) break; // a stuck row would come back at once: leave it for the next run
    }
  } catch (err) {
    log.warn('transactions_purge_failed', { purged, err: String(err) });
  }
  if (purged > 0) log.info('transactions_purged', { purged });
  return purged;
}
