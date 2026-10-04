import { log } from '../../core/logging';
import type { DimeSupabaseClient } from '../../core/supabase';
import * as jobs from './repository';

const DAY_MS = 86_400_000;
/** Finished (`done` / `failed`) jobs are history nobody reads after a month. */
const FINISHED_RETENTION_DAYS = 30;
/** `manual_create` rows exist only as idempotency records for client retries, which happen within minutes. */
const MANUAL_CREATE_RETENTION_DAYS = 7;

/** Rows per delete statement: its `id in (...)` list must stay well inside URL length limits. */
const PURGE_BATCH = 100;
/** Batches per rule per run, so a large backlog drains over several hours instead of one long run. */
const PURGE_MAX_BATCHES = 10;

/** The sweep runs every 5 minutes; only its first run of the hour (minutes 0-4) purges. Stateless, so isolates need no memory. */
export function isPurgeSlot(scheduledTimeMs: number): boolean {
  return new Date(scheduledTimeMs).getUTCMinutes() < 5;
}

/** Delete old finished jobs and stale manual-create idempotency rows. Never throws: the next hour retries. Returns rows deleted. */
export async function purgeOldJobs(db: DimeSupabaseClient, nowMs: number = Date.now()): Promise<number> {
  const rules: jobs.PurgeRule[] = [
    { statuses: ['done', 'failed'], cutoffIso: new Date(nowMs - FINISHED_RETENTION_DAYS * DAY_MS).toISOString() },
    { kind: 'manual_create', cutoffIso: new Date(nowMs - MANUAL_CREATE_RETENTION_DAYS * DAY_MS).toISOString() },
  ];
  let deleted = 0;
  try {
    for (const rule of rules) {
      for (let batch = 0; batch < PURGE_MAX_BATCHES; batch += 1) {
        const count = await jobs.deleteOldBatch(db, rule, PURGE_BATCH);
        deleted += count;
        if (count < PURGE_BATCH) break;
      }
    }
  } catch (err) {
    log.warn('jobs_purge_failed', { deleted, err: String(err) });
  }
  if (deleted > 0) log.info('jobs_purged', { deleted });
  return deleted;
}
