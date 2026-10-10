import { all, batch, first, newId, nowIso, parseJsonObject, placeholders, run, stmt } from '../../core/db';
import type { Db, SqlParam } from '../../core/db';
import { isUniqueViolation } from '../../core/db-errors';

type JobStatus = 'pending' | 'processing' | 'done' | 'failed';
export type JobKind = 'receipt' | 'voice' | 'manual_create';

export interface JobRow {
  id: string;
  user_id: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  last_error: string | null;
  idempotency_key: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface NewJob {
  user_id: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  status?: JobStatus;
  attempts?: number;
  idempotency_key?: string | null;
}

/** Raw `jobs` row: `payload` / `result` are JSON text. */
type JobDbRow = Omit<JobRow, 'payload' | 'result'> & { payload: string; result: string | null };

const toJobRow = (row: JobDbRow): JobRow => ({
  ...row,
  payload: parseJsonObject(row.payload) ?? {},
  result: parseJsonObject(row.result),
});

/** Cutoff after which a `processing` idempotency record is considered abandoned and may be re-claimed. */
const STALE_PROCESSING_SECONDS = 600;

const agoIso = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

/**
 * Insert in one atomic batch (all or nothing). A unique violation on `(user_id, idempotency_key)`
 * throws and nothing is written. One statement per row: D1 allows only 100 bound parameters each.
 */
export async function insertMany(db: Db, rows: NewJob[]): Promise<JobRow[]> {
  const now = nowIso();
  const results = await batch<JobDbRow>(
    db,
    rows.map((row) =>
      stmt(
        db,
        `INSERT INTO jobs (id, user_id, kind, payload, status, attempts, idempotency_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        [
          newId(),
          row.user_id,
          row.kind,
          JSON.stringify(row.payload),
          row.status ?? 'pending',
          row.attempts ?? 0,
          row.idempotency_key ?? null,
          now,
          now,
        ],
      ),
    ),
  );
  return results.flatMap((r) => r.map(toJobRow));
}

async function getJob(db: Db, jobId: string): Promise<JobRow | null> {
  const row = await first<JobDbRow>(db, 'SELECT * FROM jobs WHERE id = ? LIMIT 1', [jobId]);
  return row ? toJobRow(row) : null;
}

export async function findByKeys(db: Db, userId: string, keys: string[]): Promise<JobRow[]> {
  if (keys.length === 0) return [];
  const out: JobRow[] = [];
  // 100 bound parameters per statement: the user id plus up to 90 keys.
  for (let i = 0; i < keys.length; i += 90) {
    const part = keys.slice(i, i + 90);
    const rows = await all<JobDbRow>(
      db,
      `SELECT * FROM jobs WHERE user_id = ? AND idempotency_key IN (${placeholders(part.length)})`,
      [userId, ...part],
    );
    out.push(...rows.map(toJobRow));
  }
  return out;
}

export async function markDone(db: Db, jobId: string, result: Record<string, unknown> | null): Promise<void> {
  await run(db, "UPDATE jobs SET status = 'done', result = ?, updated_at = ? WHERE id = ?", [
    result === null ? null : JSON.stringify(result),
    nowIso(),
    jobId,
  ]);
}

export async function markFailed(db: Db, jobId: string, error: string): Promise<void> {
  await run(db, "UPDATE jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?", [
    error.slice(0, 500),
    nowIso(),
    jobId,
  ]);
}

/** Fail a job only if it is still pending/processing (never overwrites `done`). Returns the row when this call failed it. */
export async function failIfUnfinished(
  db: Db,
  jobId: string,
  error: string,
): Promise<Pick<JobRow, 'id' | 'user_id' | 'kind'> | null> {
  return first<Pick<JobRow, 'id' | 'user_id' | 'kind'>>(
    db,
    `UPDATE jobs SET status = 'failed', last_error = ?, updated_at = ?
     WHERE id = ? AND status IN ('pending', 'processing') RETURNING id, user_id, kind`,
    [error.slice(0, 500), nowIso(), jobId],
  );
}

/**
 * pending -> processing (attempts + 1) guarded by `status = 'pending'`, so only one claimant wins and
 * duplicate queue messages are harmless. Null when someone else holds the job or it is spent
 * (a spent job is marked failed with "max attempts exceeded" and `onExhausted` is told, so the caller can
 * notify the user).
 */
export async function claimJob(
  db: Db,
  jobId: string,
  maxAttempts: number,
  onExhausted?: (job: JobRow) => Promise<void>,
): Promise<JobRow | null> {
  const row = await getJob(db, jobId);
  if (!row || row.status !== 'pending') return null;
  if ((Number(row.attempts) || 0) >= maxAttempts) {
    await markFailed(db, jobId, 'max attempts exceeded');
    await onExhausted?.(row);
    return null;
  }
  const claimed = await first<JobDbRow>(
    db,
    `UPDATE jobs SET status = 'processing', attempts = attempts + 1, updated_at = ?
     WHERE id = ? AND status = 'pending' RETURNING *`,
    [nowIso(), jobId],
  );
  return claimed ? toJobRow(claimed) : null;
}

/** Hand a job back to `pending` so recovery picks it up at once. */
export async function releaseJob(db: Db, jobId: string, eligibleAfterSeconds = 0): Promise<void> {
  await run(db, "UPDATE jobs SET status = 'pending', updated_at = ? WHERE id = ? AND status IN ('pending', 'processing')", [
    agoIso(eligibleAfterSeconds + 1),
    jobId,
  ]);
}

/** Oldest first. Used by the recovery sweep (cutoff = now - 300 s). */
export async function listRecoverable(
  db: Db,
  input: { kind: JobKind; cutoffIso: string; limit: number },
): Promise<JobRow[]> {
  const rows = await all<JobDbRow>(
    db,
    `SELECT * FROM jobs WHERE kind = ? AND status IN ('pending', 'processing') AND updated_at < ?
     ORDER BY updated_at ASC LIMIT ?`,
    [input.kind, input.cutoffIso, input.limit],
  );
  return rows.map(toJobRow);
}

/** processing -> pending, only if still stale (conditional update). True when this call re-queued it. */
export async function requeueStaleProcessing(db: Db, jobId: string, cutoffIso: string): Promise<boolean> {
  const row = await first<{ id: string }>(
    db,
    "UPDATE jobs SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'processing' AND updated_at < ? RETURNING id",
    [nowIso(), jobId, cutoffIso],
  );
  return row !== null;
}

/** Which rows `deleteOldBatch` may remove: `updated_at` before the cutoff, optionally by status and kind. */
export interface PurgeRule {
  cutoffIso: string;
  statuses?: JobStatus[];
  kind?: JobKind;
}

/** Delete up to `limit` rows matching `rule`, oldest first, in one statement; returns how many went. */
export async function deleteOldBatch(db: Db, rule: PurgeRule, limit: number): Promise<number> {
  const where = ['updated_at < ?'];
  const params: SqlParam[] = [rule.cutoffIso];
  if (rule.statuses) {
    where.push(`status IN (${placeholders(rule.statuses.length)})`);
    params.push(...rule.statuses);
  }
  if (rule.kind) {
    where.push('kind = ?');
    params.push(rule.kind);
  }
  params.push(limit);
  return run(
    db,
    `DELETE FROM jobs WHERE id IN (SELECT id FROM jobs WHERE ${where.join(' AND ')} ORDER BY updated_at ASC LIMIT ?)`,
    params,
  );
}

type ClaimState = 'new' | 'replay' | 'in_progress' | 'retry';

export interface ClaimResult {
  state: ClaimState;
  /** The job row (empty object only for `in_progress` when the row vanished between insert and lookup). */
  row: Partial<JobRow>;
}

/**
 * Claim `(user_id, key)` for a synchronous request (`manual_create`).
 * - `new`: row inserted (status processing, attempts 1); run the action.
 * - `replay`: a finished row exists; return its stored response.
 * - `retry`: a failed (or stale processing) row was re-claimed with a conditional update.
 * - `in_progress`: another request is running it right now.
 */
export async function claimKey(
  db: Db,
  input: { userId: string; kind: JobKind; key: string; staleAfterSeconds?: number },
): Promise<ClaimResult> {
  try {
    const rows = await insertMany(db, [
      { user_id: input.userId, kind: input.kind, payload: {}, status: 'processing', attempts: 1, idempotency_key: input.key },
    ]);
    if (rows[0]) return { state: 'new', row: rows[0] };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }

  const existing = (await findByKeys(db, input.userId, [input.key]))[0];
  if (!existing) return { state: 'in_progress', row: {} }; // deleted between insert and lookup
  if (existing.status === 'done') return { state: 'replay', row: existing };

  const guard =
    existing.status === 'failed'
      ? { sql: "status = 'failed'", params: [] as SqlParam[] }
      : { sql: 'status = ? AND updated_at < ?', params: [existing.status, agoIso(input.staleAfterSeconds ?? STALE_PROCESSING_SECONDS)] };
  const reclaimed = await first<JobDbRow>(
    db,
    `UPDATE jobs SET status = 'processing', updated_at = ? WHERE id = ? AND ${guard.sql} RETURNING *`,
    [nowIso(), existing.id, ...guard.params],
  );
  return reclaimed ? { state: 'retry', row: toJobRow(reclaimed) } : { state: 'in_progress', row: existing };
}
