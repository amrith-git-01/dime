import { isUniqueViolation } from '../../core/db-errors';
import type { DimeSupabaseClient } from '../../core/supabase';
import { derivedKeys } from '../jobs/idempotency';
import * as jobs from '../jobs/repository';
import type { JobRow, NewJob } from '../jobs/repository';
import { deleteMediaQuietly, uploadMedia } from '../media/storage';
import type { UploadKind } from '../media/paths';
import { enqueueJobs } from './queue';
import type { SmsBatchBody, SmsOutcome } from './schemas';

/** Everything the request-side ingest services need. */
export interface IngestContext {
  db: DimeSupabaseClient;
  userId: string;
  /** Private bucket for raw receipts / voice notes. */
  bucket: string;
  queue: Queue;
}

/** True when a job with this `Idempotency-Key` already exists: a replay, answered without side effects. */
export async function isReplay(db: DimeSupabaseClient, userId: string, key: string | null): Promise<boolean> {
  if (!key) return false;
  return (await jobs.findByKeys(db, userId, [key])).length > 0;
}

export interface AcceptMediaInput {
  kind: 'receipt' | 'voice';
  bytes: Uint8Array;
  /** Sniffed from the magic bytes, never taken from the client. */
  contentType: string;
  extension: string;
  timezone: string;
  key: string | null;
}

const STORAGE_KIND: Record<AcceptMediaInput['kind'], UploadKind> = { receipt: 'receipts', voice: 'voice_inputs' };

/**
 * Store the raw media in the private bucket, persist a `pending` job that holds only the object
 * path, then put its id on the queue. A lost idempotency race (unique violation) drops the duplicate
 * upload; any other insert failure also cleans up the object and propagates.
 */
export async function acceptMedia(ctx: IngestContext, input: AcceptMediaInput): Promise<void> {
  const objectPath = await uploadMedia(ctx.db, {
    bucket: ctx.bucket,
    userId: ctx.userId,
    kind: STORAGE_KIND[input.kind],
    bytes: input.bytes,
    contentType: input.contentType,
    extension: input.extension,
  });

  let rows: JobRow[];
  try {
    rows = await jobs.insertMany(ctx.db, [
      {
        user_id: ctx.userId,
        kind: input.kind,
        payload: { object_path: objectPath, mime_type: input.contentType, timezone: input.timezone },
        status: 'pending',
        attempts: 0,
        idempotency_key: input.key,
      },
    ]);
  } catch (err) {
    await deleteMediaQuietly(ctx.db, ctx.bucket, objectPath);
    if (input.key && isUniqueViolation(err)) return;
    throw err;
  }
  await enqueueJobs(
    ctx.queue,
    rows.map((row) => ({ job_id: row.id, kind: input.kind })),
  );
}

export interface SmsResponse {
  accepted: true;
  results: SmsOutcome[];
}

/**
 * Queue a batch of SMS, all or nothing. Identical messages inside the batch (same body and
 * timestamp) are reported as `duplicate` and not queued. With an `Idempotency-Key` each queued
 * message gets the derived key `"<key>:<index>"`, so a replay rebuilds the whole result from the
 * rows that already exist.
 */
export async function acceptSms(
  ctx: IngestContext,
  input: { body: SmsBatchBody; timezone: string; key: string | null },
): Promise<SmsResponse> {
  const { messages } = input.body;
  const firstIndex = new Map<string, number>();
  const results: SmsOutcome[] = [];
  const toQueue: number[] = [];
  messages.forEach((item, index) => {
    const fingerprint = `${item.body}\u0000${item.received_at.iso}`;
    const first = firstIndex.get(fingerprint);
    if (first !== undefined) {
      results.push({ index, status: 'duplicate', duplicate_of: first });
      return;
    }
    firstIndex.set(fingerprint, index);
    results.push({ index, status: 'queued' });
    toQueue.push(index);
  });

  const keys = input.key ? derivedKeys(input.key, messages.length) : null;
  const queueKeys = keys ? toQueue.map((i) => keys[i] as string) : null;

  const withJobIds = (existing: JobRow[]): SmsResponse => {
    const byKey = new Map(existing.map((row) => [row.idempotency_key, row.id]));
    for (const index of toQueue) {
      const id = byKey.get(keys?.[index] ?? null);
      if (id) (results[index] as SmsOutcome).job_id = id;
    }
    return { accepted: true, results };
  };

  if (queueKeys) {
    const existing = await jobs.findByKeys(ctx.db, ctx.userId, queueKeys);
    if (existing.length > 0) return withJobIds(existing);
  }

  const rows: NewJob[] = toQueue.map((index, i) => {
    const item = messages[index] as SmsBatchBody['messages'][number];
    return {
      user_id: ctx.userId,
      kind: 'sms',
      payload: { body: item.body, received_at: item.received_at.iso, timezone: input.timezone },
      status: 'pending',
      attempts: 0,
      idempotency_key: queueKeys ? (queueKeys[i] as string) : null,
    };
  });

  let inserted: JobRow[];
  try {
    inserted = await jobs.insertMany(ctx.db, rows);
  } catch (err) {
    if (queueKeys && isUniqueViolation(err)) {
      const existing = await jobs.findByKeys(ctx.db, ctx.userId, queueKeys);
      if (existing.length > 0) return withJobIds(existing);
    }
    throw err;
  }

  toQueue.forEach((index, i) => {
    const row = inserted[i];
    if (row) (results[index] as SmsOutcome).job_id = row.id;
  });
  await enqueueJobs(
    ctx.queue,
    inserted.map((row) => ({ job_id: row.id, kind: 'sms' as const })),
  );
  return { accepted: true, results };
}
