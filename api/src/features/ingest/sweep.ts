import type { Bindings } from '../../core/env';
import { log } from '../../core/logging';
import type { Db } from '../../core/db';
import * as jobs from '../jobs/repository';
import { isPurgeSlot, purgeOldJobs } from '../jobs/purge';
import { enqueueJobs } from './queue';
import { INGEST_KINDS } from './schemas';
import type { IngestMessage } from './schemas';

/** Cron expression of the recovery sweep (keep in sync with `triggers.crons` in wrangler.jsonc). */
export const SWEEP_CRON = '*/5 * * * *';
/** A pending/processing job untouched for this long is considered lost. */
const RECOVERY_AGE_SECONDS = 120;
/** Jobs re-sent per kind per run (oldest first); the rest wait for the next run. */
const SWEEP_LIMIT_PER_KIND = 50;
const REQUEUE_CONCURRENCY = 10;

export interface SweepResult {
  requeued: number;
  resent: number;
}

/**
 * Recovery for jobs whose queue message was lost (send failed after the insert, consumer crashed,
 * retries exhausted): stale `processing` rows go back to `pending` with a conditional update, then
 * every stale job, oldest first, is sent to the queue again. Re-sending is safe: claiming is
 * conditional, so a duplicate message does nothing.
 */
export async function sweepJobs(db: Db, queue: Queue, nowMs: number = Date.now()): Promise<SweepResult> {
  const cutoffIso = new Date(nowMs - RECOVERY_AGE_SECONDS * 1000).toISOString();
  const perKind = await Promise.all(
    INGEST_KINDS.map(async (kind) => ({
      kind,
      rows: await jobs.listRecoverable(db, { kind, cutoffIso, limit: SWEEP_LIMIT_PER_KIND }),
    })),
  );

  const toSend: IngestMessage[] = [];
  let requeued = 0;
  for (const { kind, rows } of perKind) {
    const stale = rows.filter((row) => row.status === 'processing');
    // `pending` rows are re-sent as they are; `processing` ones must be released first (conditional).
    for (const row of rows.filter((r) => r.status === 'pending')) toSend.push({ job_id: row.id, kind });
    for (let i = 0; i < stale.length; i += REQUEUE_CONCURRENCY) {
      const results = await Promise.all(
        stale.slice(i, i + REQUEUE_CONCURRENCY).map(async (row) => ({ row, ok: await jobs.requeueStaleProcessing(db, row.id, cutoffIso) })),
      );
      for (const { row, ok } of results) {
        if (!ok) continue;
        requeued += 1;
        toSend.push({ job_id: row.id, kind });
      }
    }
  }

  const sent = await enqueueJobs(queue, toSend);
  if (toSend.length > 0) log.info('ingest_sweep', { requeued, resent: toSend.length, sent });
  return { requeued, resent: sent ? toSend.length : 0 };
}

/**
 * Scheduled entry point: uses the D1 binding. The first run of each hour
 * also purges old job rows, after the recovery pass so a purge failure never delays recovery.
 */
export async function runSweep(env: Bindings, scheduledTimeMs: number = Date.now()): Promise<SweepResult> {
  const db = env.DB;
  const result = await sweepJobs(db, env.INGEST_QUEUE);
  if (isPurgeSlot(scheduledTimeMs)) await purgeOldJobs(db, scheduledTimeMs);
  return result;
}
