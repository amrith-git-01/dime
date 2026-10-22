import { run } from '../../core/db';
import type { Db } from '../../core/db';
import { log } from '../../core/logging';

/**
 * Marks the user's engine profile stale after a transaction write (create, edit, delete, category move).
 * One cheap upsert; it also bumps `dirty_seq`, so a job already running can tell it was overtaken and keep `dirty` set.
 * A first mark creates a stub row (version 0, empty profile) that the job later fills in.
 * Never throws: a failed mark must not fail the write that triggered it (the nightly job refreshes anyway).
 */
export async function markEngineDirty(db: Db, userId: string): Promise<void> {
  try {
    await run(
      db,
      `INSERT INTO engine_patterns (user_id, version, history_days, profile, dirty, dirty_seq, computed_at)
       VALUES (?, 0, 0, '{}', 1, 1, '1970-01-01T00:00:00.000Z')
       ON CONFLICT (user_id) DO UPDATE SET dirty = 1, dirty_seq = dirty_seq + 1`,
      [userId],
    );
  } catch (err) {
    log.warn('engine_mark_dirty_failed', { userId, err });
  }
}
