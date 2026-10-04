import { ConflictError, ValidationError } from '../../core/errors';
import { log } from '../../core/logging';
import type { DimeSupabaseClient } from '../../core/supabase';
import * as repo from './repository';
import type { JobKind } from './repository';

/**
 * `Idempotency-Key` handling (contract C2). Port of backend `features/jobs/idempotency.py`.
 *
 * - Queued endpoints (receipt / voice / sms, R3) store the key on their `jobs` rows; SMS batches use
 *   one derived key per message (`"<key>:<index>"`).
 * - `POST /transactions` claims the key with a `manual_create` job (processing -> done) whose `result`
 *   is `{status_code, body}`; a repeat returns that stored response.
 * - Re-using a key with a different payload is not detected: the original response is replayed.
 */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{7,99}$/;

/** Cleaned key, `null` when absent/blank, or a 422 for a malformed key. */
export function parseIdempotencyKey(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const key = raw.trim();
  if (!key) return null;
  if (!KEY_RE.test(key)) {
    throw new ValidationError("Invalid Idempotency-Key (use a UUID or 8-100 chars of letters, digits, '-', '_', '.').");
  }
  return key;
}

export function derivedKeys(key: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${key}:${i}`);
}

export interface IdempotentResponse<T> {
  status: number;
  body: T;
}

/** Run `action` at most once per `(user_id, key)`; replays return the stored response. */
export async function runIdempotent<T extends Record<string, unknown>>(
  db: DimeSupabaseClient,
  input: { userId: string; key: string; kind: JobKind; action: () => Promise<T>; statusCode?: number; fallbackBody: T },
): Promise<IdempotentResponse<T>> {
  const statusCode = input.statusCode ?? 201;
  const { state, row } = await repo.claimKey(db, { userId: input.userId, kind: input.kind, key: input.key });
  if (state === 'replay') {
    const stored = row.result;
    const body = stored?.['body'];
    if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
      return { status: Number(stored?.['status_code']) || statusCode, body: body as T };
    }
    return { status: statusCode, body: input.fallbackBody };
  }
  if (state === 'in_progress') throw new ConflictError('A request with this Idempotency-Key is still being processed.');

  const jobId = String(row.id);
  let body: T;
  try {
    body = await input.action();
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    const message = err instanceof Error ? err.message : String(err);
    // Never let a bookkeeping failure mask the original error.
    await repo.markFailed(db, jobId, `${name}: ${message}`).catch((markErr: unknown) => {
      log.error('idempotency_mark_failed_failed', { err: markErr, jobId });
    });
    throw err;
  }
  await repo.markDone(db, jobId, { status_code: statusCode, body });
  return { status: statusCode, body };
}
