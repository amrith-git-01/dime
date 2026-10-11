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

/** True when a job with this `Idempotency-Key` already exists: a replay, answered without side effects. */
export async function isReplay(db: Db, userId: string, key: string | null): Promise<boolean> {
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
 * Over the daily Workers AI cap or the user's daily limit answers 429 before anything is stored. Otherwise stores the raw media in R2, persist a `pending` job that holds only the object
 * path, then put its id on the queue. A lost idempotency race (unique violation) drops the duplicate
 * upload; any other insert failure also cleans up the object and propagates.
 */
export async function acceptMedia(ctx: IngestContext, input: AcceptMediaInput): Promise<void> {
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
        payload: { object_path: objectPath, mime_type: input.contentType, timezone: input.timezone },
        status: 'pending',
        attempts: 0,
        idempotency_key: input.key,
      },
    ]);
  } catch (err) {
    await deleteMediaQuietly(ctx.storage, objectPath);
    await giveBack();
    if (input.key && isUniqueViolation(err)) return;
    throw err;
  }
  await enqueueJobs(
    ctx.queue,
    rows.map((row) => ({ job_id: row.id, kind: input.kind })),
  );
}
