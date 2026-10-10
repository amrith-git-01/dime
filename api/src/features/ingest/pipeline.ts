import type { AppConfig } from '../../core/env';
import { log } from '../../core/logging';
import type { Db } from '../../core/db';
import { addNeurons, assertJobAllowed, estimateCaptureNeurons } from '../ai/neuron-cap';
import { parseReceipt, parseVoice } from '../ai/service';
import type { ParsedExpense } from '../ai/parse-output';
import type { AiBinding, WorkersAiClient } from '../ai/workers-ai';
import type { JobRow } from '../jobs/repository';
import { downloadMedia } from '../media/storage';
import type { MediaStore } from '../media/storage';
import type { Publisher } from '../realtime/events';
import { notifyAfterInsert } from '../notifications/after-insert';
import { createTransaction } from '../transactions/service';
import type { TxContext } from '../transactions/service';
import { loadCategoryContext } from './categories';
import { mediaPayloadSchema } from './schemas';

/** A job that can never succeed as stored (bad payload, unknown kind): fail it, do not retry. */
export class InvalidJobError extends Error {
  override name = 'InvalidJobError';
}

/** What a job needs: the D1 database, the R2 media store and the Workers AI binding. */
export interface IngestStores {
  db: Db;
  storage: MediaStore;
  ai: AiBinding | undefined;
  /** Live-update broadcast (the created transaction reaches the user's open app). Absent in unit tests. */
  publisher?: Publisher | undefined;
}

export interface JobOutcome {
  transactionId: string;
  /** `created` rows got notifications; `existing` ones were merged into a duplicate. */
  created: boolean;
}

interface FinishInput {
  jobId: string;
  parsed: ParsedExpense;
  detectedVia: 'scan' | 'voice';
  timezone: string;
  receiptUrl?: string;
  voiceUrl?: string;
}

async function finish(ctx: TxContext, input: FinishInput): Promise<JobOutcome> {
  const { parsed } = input;
  const nowMs = Date.now();
  const transactionAt = parsed.date ?? { ms: nowMs, iso: new Date(nowMs).toISOString() };
  const result = await createTransaction(ctx, {
    amount: parsed.amount,
    type: parsed.type,
    counterpartyName: parsed.counterpartyName,
    counterpartyType: parsed.counterpartyType,
    categoryId: parsed.categoryId,
    categoryName: parsed.category,
    note: parsed.note,
    transactionAt,
    detectedVia: input.detectedVia,
    receiptUrl: input.receiptUrl ?? null,
    voiceUrl: input.voiceUrl ?? null,
  });
  if (result.kind === 'existing') return { transactionId: result.id, created: false };

  // The row exists now: nothing after this point may fail the job (a retry would re-run the AI calls).
  try {
    await notifyAfterInsert(ctx.db, {
      userId: ctx.userId,
      timezone: input.timezone,
      transactionId: result.id,
      type: parsed.type,
      detectedVia: input.detectedVia,
      transactionAtMs: transactionAt.ms,
      categoryId: result.categoryId,
      amount: parsed.amount,
      counterpartyName: parsed.counterpartyName,
    });
  } catch (err) {
    log.error('ingest_notify_failed', { err, jobId: input.jobId, transactionId: result.id });
  }
  return { transactionId: result.id, created: true };
}

/**
 * Run one claimed job end to end: download media, parse it with the AI
 * services and create the transaction (server-set `detected_via` / media path). Throws the AI /
 * upstream errors for the consumer to classify.
 */
export async function runIngestJob(
  { db, storage, ai, publisher }: IngestStores,
  config: AppConfig,
  job: Pick<JobRow, 'id' | 'user_id' | 'kind' | 'payload'>,
): Promise<JobOutcome> {
  const ctx: TxContext = {
    db,
    storage,
    userId: job.user_id,
    media: { expiresIn: config.signedUrlTtlSeconds },
    publish: publisher ? (events) => publisher(job.user_id, events) : undefined,
  };

  if (job.kind === 'receipt' || job.kind === 'voice') {
    const payload = mediaPayloadSchema.safeParse(job.payload);
    if (!payload.success) throw new InvalidJobError('Job payload is invalid.');
    const p = payload.data;
    // Workers AI is billed past a free daily allowance: the day may have filled up since the upload.
    const workersAi: WorkersAiClient = {
      binding: ai,
      config: config.workersAi,
      timeoutMs: config.ai.timeoutMs,
      recordNeurons: async (neurons) => {
        try {
          await addNeurons(db, Date.now(), neurons);
        } catch (err) {
          log.error('ai_usage_write_failed', { err, jobId: job.id, neurons }); // the call already succeeded: never fail the job for the counter
        }
      },
    };
    if (job.kind === 'receipt') {
      const [media, categories] = await Promise.all([downloadMedia(storage, p.object_path), loadCategoryContext(db, job.user_id)]);
      await assertJobAllowed(db, config.workersAi, estimateCaptureNeurons('receipt', media.byteLength));
      const parsed = await parseReceipt(config, workersAi, { bytes: media, mimeType: p.mime_type }, categories);
      return finish(ctx, { jobId: job.id, parsed, detectedVia: 'scan', timezone: p.timezone, receiptUrl: p.object_path });
    }
    const [media, categories] = await Promise.all([
      downloadMedia(storage, p.object_path),
      loadCategoryContext(db, job.user_id),
    ]);
    await assertJobAllowed(db, config.workersAi, estimateCaptureNeurons('voice', media.byteLength));
    const parsed = await parseVoice(config, workersAi, media, p.mime_type, categories);
    return finish(ctx, { jobId: job.id, parsed, detectedVia: 'voice', timezone: p.timezone, voiceUrl: p.object_path });
  }

  throw new InvalidJobError(`Unsupported job kind '${job.kind}'.`);
}
