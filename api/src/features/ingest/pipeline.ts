import type { AppConfig } from '../../core/env';
import { log } from '../../core/logging';
import type { DimeSupabaseClient } from '../../core/supabase';
import { parseReceipt, parseSms, parseVoice } from '../ai/service';
import type { ParsedExpense } from '../ai/parse-output';
import type { JobRow } from '../jobs/repository';
import { downloadMedia, signShortLivedUrl } from '../media/storage';
import { notifyAfterInsert } from '../notifications/after-insert';
import { parseDatetime } from '../transactions/schemas';
import type { Instant } from '../transactions/schemas';
import { createTransaction } from '../transactions/service';
import type { TxContext } from '../transactions/service';
import { loadCategoryContext } from './categories';
import { mediaPayloadSchema, smsPayloadSchema } from './schemas';

/** A job that can never succeed as stored (bad payload, unknown kind): fail it, do not retry. */
export class InvalidJobError extends Error {
  override name = 'InvalidJobError';
}

/** Lifetime of the URL handed to Groq: covers the fetch plus a slow model call, nothing more. */
const RECEIPT_URL_TTL_SECONDS = 300;

export interface JobOutcome {
  transactionId: string;
  /** `created` rows got notifications; `existing` ones were merged into a duplicate. */
  created: boolean;
}

interface FinishInput {
  jobId: string;
  parsed: ParsedExpense;
  detectedVia: 'scan' | 'voice' | 'sms';
  timezone: string;
  receiptUrl?: string;
  voiceUrl?: string;
  /** Used when the model found no date (the SMS receive time). */
  fallbackAt?: Instant | null;
}

async function finish(ctx: TxContext, input: FinishInput): Promise<JobOutcome> {
  const { parsed } = input;
  const nowMs = Date.now();
  const transactionAt = parsed.date ?? input.fallbackAt ?? { ms: nowMs, iso: new Date(nowMs).toISOString() };
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
 * Run one claimed job end to end: download media (or take the SMS body), parse it with the AI
 * services and create the transaction (server-set `detected_via` / media path). Throws the AI /
 * upstream errors for the consumer to classify.
 */
export async function runIngestJob(
  db: DimeSupabaseClient,
  config: AppConfig,
  job: Pick<JobRow, 'id' | 'user_id' | 'kind' | 'payload'>,
): Promise<JobOutcome> {
  const ctx: TxContext = {
    db,
    userId: job.user_id,
    media: { defaultBucket: config.privateStorageBucket, expiresIn: config.signedUrlTtlSeconds },
  };

  if (job.kind === 'receipt' || job.kind === 'voice') {
    const payload = mediaPayloadSchema.safeParse(job.payload);
    if (!payload.success) throw new InvalidJobError('Job payload is invalid.');
    const p = payload.data;
    if (job.kind === 'receipt') {
      // Groq fetches the image itself from a short-lived signed URL (no bytes through the Worker, no
      // 4 MB base64 limit); only when signing fails do we download and send base64.
      const [signedUrl, categories] = await Promise.all([
        signShortLivedUrl(db, config.privateStorageBucket, p.object_path, RECEIPT_URL_TTL_SECONDS),
        loadCategoryContext(db, job.user_id),
      ]);
      const image = signedUrl
        ? { url: signedUrl }
        : { bytes: await downloadMedia(db, config.privateStorageBucket, p.object_path), mimeType: p.mime_type };
      const parsed = await parseReceipt(config, image, categories);
      return finish(ctx, { jobId: job.id, parsed, detectedVia: 'scan', timezone: p.timezone, receiptUrl: p.object_path });
    }
    const [media, categories] = await Promise.all([
      downloadMedia(db, config.privateStorageBucket, p.object_path),
      loadCategoryContext(db, job.user_id),
    ]);
    const parsed = await parseVoice(config, media, p.mime_type, categories);
    return finish(ctx, { jobId: job.id, parsed, detectedVia: 'voice', timezone: p.timezone, voiceUrl: p.object_path });
  }

  if (job.kind === 'sms') {
    const payload = smsPayloadSchema.safeParse(job.payload);
    if (!payload.success) throw new InvalidJobError('Job payload is invalid.');
    const p = payload.data;
    const categories = await loadCategoryContext(db, job.user_id);
    const parsed = await parseSms(config, p.body, categories);
    return finish(ctx, { jobId: job.id, parsed, detectedVia: 'sms', timezone: p.timezone, fallbackAt: parseDatetime(p.received_at) });
  }

  throw new InvalidJobError(`Unsupported job kind '${job.kind}'.`);
}
