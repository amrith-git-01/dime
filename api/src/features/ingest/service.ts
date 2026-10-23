import { isUniqueViolation } from '../../core/db-errors';
import type { Db } from '../../core/db';
import { claimUpload, estimateCaptureNeurons, releaseCapture } from '../ai/neuron-cap';
import type { NeuronLimits } from '../ai/neuron-cap';
import * as jobs from '../jobs/repository';
import type { JobRow } from '../jobs/repository';
import { deleteMediaQuietly, uploadMedia } from '../media/storage';
import type { MediaStore } from '../media/storage';
import type { UploadKind } from '../media/paths';
import { enqueueJobs } from './queue';

/** Everything the request-side ingest services need. */
export interface IngestContext {
  db: Db;
  /** R2 media bucket (raw receipt / voice uploads). */
  storage: MediaStore;
  userId: string;
  queue: Queue;
  /** Workers AI caps (global neurons per day, receipts and voice captures per user per day). */
  limits: NeuronLimits;
}

/** The id of the job that already holds this `Idempotency-Key`: a replay, answered without side effects. Null for a new key. */
export async function findReplayJobId(db: Db, userId: string, key: string | null): Promise<string | null> {
  if (!key) return null;
  return (await jobs.findByKeys(db, userId, [key]))[0]?.id ?? null;
}

export interface AcceptMediaInput {
  kind: 'receipt' | 'voice';
  bytes: Uint8Array;
  /** Sniffed from the magic bytes, never taken from the client. */
  contentType: string;
  extension: string;
  timezone: string;
  /** ISO instant of the capture (the request time unless the app queued it offline). */
  capturedAt: string;
  key: string | null;
}

const STORAGE_KIND: Record<AcceptMediaInput['kind'], UploadKind> = { receipt: 'receipts', voice: 'voice_inputs' };

/**
 * Over the daily Workers AI cap or the user's daily limit answers 429 before anything is stored. Otherwise stores the raw media in R2, persist a `pending` job that holds only the object
 * path, then put its id on the queue. A lost idempotency race (unique violation) drops the duplicate
 * upload; any other insert failure also cleans up the object and propagates. Returns the job id (the
 * winner's, after a lost race), which the client polls on `GET /ingest/jobs/:id`.
 */
export async function acceptMedia(ctx: IngestContext, input: AcceptMediaInput): Promise<string | null> {
  // Counted here, atomically (concurrent uploads cannot pass the limit); given back below if no job results.
  await claimUpload(ctx.db, ctx.userId, input.kind, ctx.limits, estimateCaptureNeurons(input.kind, input.bytes.byteLength));
  const claimedAt = Date.now();
  const giveBack = () => releaseCapture(ctx.db, ctx.userId, input.kind, claimedAt).catch(() => undefined);
  let objectPath: string;
  try {
    objectPath = await uploadMedia(ctx.storage, {
      userId: ctx.userId,
      kind: STORAGE_KIND[input.kind],
      bytes: input.bytes,
      contentType: input.contentType,
      extension: input.extension,
    });
  } catch (err) {
    await giveBack();
    throw err;
  }

  let rows: JobRow[];
  try {
    rows = await jobs.insertMany(ctx.db, [
      {
        user_id: ctx.userId,
        kind: input.kind,
        payload: { object_path: objectPath, mime_type: input.contentType, timezone: input.timezone, captured_at: input.capturedAt },
        status: 'pending',
        attempts: 0,
        idempotency_key: input.key,
      },
    ]);
  } catch (err) {
    await deleteMediaQuietly(ctx.storage, objectPath);
    await giveBack();
    if (input.key && isUniqueViolation(err)) return findReplayJobId(ctx.db, ctx.userId, input.key);
    throw err;
  }
  await enqueueJobs(
    ctx.queue,
    rows.map((row) => ({ job_id: row.id, kind: input.kind })),
  );
  return rows[0]?.id ?? null;
}
