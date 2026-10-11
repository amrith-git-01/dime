import { log } from '../../core/logging';
import { run } from '../../core/db';
import type { Db, SqlParam } from '../../core/db';
import * as jobs from './repository';

const DAY_MS = 86_400_000;
/** Finished (`done` / `failed`) jobs are history nobody reads after a month. */
const FINISHED_RETENTION_DAYS = 30;
/** `manual_create` rows exist only as idempotency records for client retries, which happen within minutes. */
const MANUAL_CREATE_RETENTION_DAYS = 7;

const SESSION_RETENTION_DAYS = 7;
const USAGE_RETENTION_DAYS = 90;
const NOTIFICATION_RETENTION_DAYS = 30;

/** Bounded delete of one non-job table: `WHERE` is the rule, `params` its bound values. */
interface TableRule {
  table: string;
  where: string;
  params: SqlParam[];
}

function tableRules(nowMs: number): TableRule[] {
  const iso = (days: number) => new Date(nowMs - days * DAY_MS).toISOString();
  const usageDay = iso(USAGE_RETENTION_DAYS).slice(0, 10);
  const sessionCutoff = iso(SESSION_RETENTION_DAYS);
  return [
    { table: 'auth_sessions', where: 'expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)', params: [sessionCutoff, sessionCutoff] },
    { table: 'ai_usage', where: 'day < ?', params: [usageDay] },
    { table: 'ai_user_usage', where: 'day < ?', params: [usageDay] },
    { table: 'agent_usage', where: 'day < ?', params: [usageDay] },
    { table: 'notifications', where: 'deleted_at IS NOT NULL AND deleted_at < ?', params: [iso(NOTIFICATION_RETENTION_DAYS)] },
  ];
}

/** Rows per delete statement: its `id in (...)` list must stay well inside URL length limits. */
const PURGE_BATCH = 100;
/** Batches per rule per run, so a large backlog drains over several hours instead of one long run. */
const PURGE_MAX_BATCHES = 10;

/** The sweep runs every 5 minutes; only its first run of the hour (minutes 0-4) purges. Stateless, so isolates need no memory. */
export function isPurgeSlot(scheduledTimeMs: number): boolean {
  return new Date(scheduledTimeMs).getUTCMinutes() < 5;
}

/** Delete old finished jobs, stale manual-create idempotency rows, dead sessions, old usage counters and old soft-deleted notifications. Never throws: the next hour retries. Returns rows deleted. */
export async function purgeOldJobs(db: Db, nowMs: number = Date.now()): Promise<number> {
  const rules: jobs.PurgeRule[] = [
    { statuses: ['done', 'failed'], cutoffIso: new Date(nowMs - FINISHED_RETENTION_DAYS * DAY_MS).toISOString() },
    { kind: 'manual_create', cutoffIso: new Date(nowMs - MANUAL_CREATE_RETENTION_DAYS * DAY_MS).toISOString() },
  ];
  let deleted = 0;
  try {
    for (const { table, where, params } of tableRules(nowMs)) {
      for (let batch = 0; batch < PURGE_MAX_BATCHES; batch += 1) {
        const count = await run(db, `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${where} LIMIT ?)`, [...params, PURGE_BATCH]);
        deleted += count;
        if (count < PURGE_BATCH) break;
      }
    }
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
