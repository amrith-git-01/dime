import { isUniqueViolation } from '../../core/db-errors';
import type { DimeSupabaseClient } from '../../core/supabase';

export type JobStatus = 'pending' | 'processing' | 'done' | 'failed';
export type JobKind = 'receipt' | 'voice' | 'sms' | 'manual_create';

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

/** Cutoff after which a `processing` idempotency record is considered abandoned and may be re-claimed. */
export const STALE_PROCESSING_SECONDS = 600;

const nowIso = () => new Date().toISOString();
const agoIso = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

/** Insert in one statement (all or nothing). A unique violation on `(user_id, idempotency_key)` throws. */
export async function insertMany(db: DimeSupabaseClient, rows: NewJob[]): Promise<JobRow[]> {
  const { data } = await db.from('jobs').insert(rows).select('*').throwOnError().overrideTypes<JobRow[], { merge: false }>();
  return data;
}

export async function getJob(db: DimeSupabaseClient, jobId: string): Promise<JobRow | null> {
  const { data } = await db
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .limit(1)
    .throwOnError()
    .overrideTypes<JobRow[], { merge: false }>();
  return data[0] ?? null;
}

export async function findByKeys(db: DimeSupabaseClient, userId: string, keys: string[]): Promise<JobRow[]> {
  if (keys.length === 0) return [];
  const { data } = await db
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .in('idempotency_key', keys)
    .throwOnError()
    .overrideTypes<JobRow[], { merge: false }>();
  return data;
}

export async function markDone(db: DimeSupabaseClient, jobId: string, result: Record<string, unknown> | null): Promise<void> {
  await db.from('jobs').update({ status: 'done', result, updated_at: nowIso() }).eq('id', jobId).throwOnError();
}

export async function markFailed(db: DimeSupabaseClient, jobId: string, error: string): Promise<void> {
  await db
    .from('jobs')
    .update({ status: 'failed', last_error: error.slice(0, 500), updated_at: nowIso() })
    .eq('id', jobId)
    .throwOnError();
}

/** Fail a job only if it is still pending/processing (never overwrites `done`). Returns the row when this call failed it. */
export async function failIfUnfinished(
  db: DimeSupabaseClient,
  jobId: string,
  error: string,
): Promise<Pick<JobRow, 'id' | 'user_id' | 'kind'> | null> {
  const { data } = await db
    .from('jobs')
    .update({ status: 'failed', last_error: error.slice(0, 500), updated_at: nowIso() })
    .eq('id', jobId)
    .in('status', ['pending', 'processing'])
    .select('id,user_id,kind')
    .throwOnError()
    .overrideTypes<Pick<JobRow, 'id' | 'user_id' | 'kind'>[], { merge: false }>();
  return data[0] ?? null;
}

/**
 * pending -> processing (attempts + 1) guarded by `status = 'pending'`, so only one claimant wins and
 * duplicate queue messages are harmless. Null when someone else holds the job or it is spent
 * (a spent job is marked failed with "max attempts exceeded").
 */
export async function claimJob(db: DimeSupabaseClient, jobId: string, maxAttempts: number): Promise<JobRow | null> {
  const row = await getJob(db, jobId);
  if (!row || row.status !== 'pending') return null;
  const attempts = Number(row.attempts) || 0;
  if (attempts >= maxAttempts) {
    await markFailed(db, jobId, 'max attempts exceeded');
    return null;
  }
  const { data } = await db
    .from('jobs')
    .update({ status: 'processing', attempts: attempts + 1, updated_at: nowIso() })
    .eq('id', jobId)
    .eq('status', 'pending')
    .select('*')
    .throwOnError()
    .overrideTypes<JobRow[], { merge: false }>();
  return data[0] ?? null;
}

/** Hand a job back to `pending` so recovery picks it up at once. */
export async function releaseJob(db: DimeSupabaseClient, jobId: string, eligibleAfterSeconds = 0): Promise<void> {
  await db
    .from('jobs')
    .update({ status: 'pending', updated_at: agoIso(eligibleAfterSeconds + 1) })
    .eq('id', jobId)
    .in('status', ['pending', 'processing'])
    .throwOnError();
}

/** Oldest first. Used by the recovery sweep (cutoff = now - 120 s). */
export async function listRecoverable(
  db: DimeSupabaseClient,
  input: { kind: JobKind; cutoffIso: string; limit: number },
): Promise<JobRow[]> {
  const { data } = await db
    .from('jobs')
    .select('*')
    .eq('kind', input.kind)
    .in('status', ['pending', 'processing'])
    .lt('updated_at', input.cutoffIso)
    .order('updated_at', { ascending: true })
    .limit(input.limit)
    .throwOnError()
    .overrideTypes<JobRow[], { merge: false }>();
  return data;
}

/** processing -> pending, only if still stale (conditional update). True when this call re-queued it. */
export async function requeueStaleProcessing(db: DimeSupabaseClient, jobId: string, cutoffIso: string): Promise<boolean> {
  const { data } = await db
    .from('jobs')
    .update({ status: 'pending', updated_at: nowIso() })
    .eq('id', jobId)
    .eq('status', 'processing')
    .lt('updated_at', cutoffIso)
    .select('id')
    .throwOnError()
    .overrideTypes<{ id: string }[], { merge: false }>();
  return data.length > 0;
}

export type ClaimState = 'new' | 'replay' | 'in_progress' | 'retry';

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
  db: DimeSupabaseClient,
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

  let query = db.from('jobs').update({ status: 'processing', updated_at: nowIso() }).eq('id', existing.id);
  query =
    existing.status === 'failed'
      ? query.eq('status', 'failed')
      : query.eq('status', existing.status).lt('updated_at', agoIso(input.staleAfterSeconds ?? STALE_PROCESSING_SECONDS));
  const { data } = await query.select('*').throwOnError().overrideTypes<JobRow[], { merge: false }>();
  const reclaimed = data[0];
  return reclaimed ? { state: 'retry', row: reclaimed } : { state: 'in_progress', row: existing };
}
