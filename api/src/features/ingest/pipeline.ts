import type { AppConfig } from '../../core/env';
import { log } from '../../core/logging';
import type { Db } from '../../core/db';
import { addNeurons, assertJobAllowed, estimateCaptureNeurons } from '../ai/neuron-cap';
import type { DateReference } from '../ai/prompts';
import { parseReceipt, parseVoice } from '../ai/service';
import { LOW_CONFIDENCE } from '../ai/parse-output';
import type { ParsedExpense } from '../ai/parse-output';
import type { AiBinding, WorkersAiClient } from '../ai/workers-ai';
import type { JobRow } from '../jobs/repository';
import { downloadMedia } from '../media/storage';
import type { MediaStore } from '../media/storage';
import type { Publisher } from '../realtime/events';
import { bodyForAutoTx, createEmitter, titleForAutoTx } from '../notifications/emitter';
import { reconcileUserBudgetAlerts } from '../notifications/budget-alerts';
import { fetchMetaByIds } from '../categories/repository';
import * as txRepo from '../transactions/repository';
import { createTransaction } from '../transactions/service';
import type { TxContext } from '../transactions/service';
import type { TransactionKind } from '../transactions/schemas';
import { fetchByUserId } from '../user-settings/repository';
import { resolveUserTimezone } from '../user-settings/service';
import { settingsFromRow } from '../user-settings/snapshot';
import type { UserSettings } from '../user-settings/snapshot';
import { dateKey, localDate, startOfLocalDay } from '../../core/timezone';
import { weekdayName } from '../agent/dates';
import { parseDateKey } from '../recurring/schedule';
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

/** Why a capture was not posted and needs the user: its amount is in a foreign currency (the app never converts). */
export interface CaptureReview {
  reason: 'foreign_currency';
  currency: string;
  amount: string;
  counterpartyName: string;
}

export interface JobOutcome {
  /** The row the job made; null when it made none (`needsReview`). */
  transactionId: string | null;
  /** `false` when the job had already made its row (a re-run), or made none: nothing new was written or announced. */
  created: boolean;
  /** Set when the job posted nothing and the user was asked to add it by hand. */
  needsReview?: CaptureReview;
}

/** The identity of the row a capture job makes: a re-run of the same job finds it instead of calling the AI and inserting again. */
export const jobIdentity = (jobId: string): string => `job:${jobId}`;

interface FinishInput {
  jobId: string;
  parsed: ParsedExpense;
  detectedVia: 'scan' | 'voice';
  timezone: string;
  /** When the user captured it (UTC ms): the transaction's time when the model finds no date. */
  capturedAtMs: number;
  receiptUrl?: string;
  voiceUrl?: string;
}

/** The stored `captured_at` as ms, or now for jobs queued before the field existed (or an unreadable value). */
function captureTime(stored: string | undefined): number {
  const ms = stored ? Date.parse(stored) : NaN;
  return Number.isNaN(ms) ? Date.now() : ms;
}

/** The capture's calendar date and weekday in the user's timezone, for the parser to resolve relative dates. */
function referenceDate(timezone: string, capturedAtMs: number): DateReference {
  const day = localDate(timezone, capturedAtMs);
  return { date: dateKey(day), weekday: weekdayName(day) };
}

/**
 * How a capture counts: what the model said when it fits, except that an ATM / cash withdrawal the model called a transfer
 * counts as spend for a user who switched `count_cash_withdrawals_as_spend` on. Null = the default for the direction and counterparty.
 */
export function captureKind(parsed: ParsedExpense, settings: UserSettings): TransactionKind | null {
  if (parsed.kind === 'transfer' && parsed.transferReason === 'cash_withdrawal' && settings.count_cash_withdrawals_as_spend && parsed.type === 'debit') {
    return 'spend';
  }
  return parsed.kind;
}

/**
 * A capture in another currency is never posted as rupees: the job ends in review and the user is asked (a notification that opens
 * the manual form) to add it with the rupee amount. Never throws: the AI work is done and must not be repeated.
 */
async function needsRupees(ctx: TxContext, settings: UserSettings, input: FinishInput): Promise<JobOutcome> {
  const { parsed } = input;
  const review: CaptureReview = { reason: 'foreign_currency', currency: parsed.currency, amount: parsed.amount, counterpartyName: parsed.counterpartyName };
  try {
    await createEmitter(ctx.db, ctx.userId, settings, undefined, ctx.publish).captureNeedsReview({
      jobId: input.jobId,
      title: 'This amount is not in rupees',
      body: `${parsed.counterpartyName}: ${parsed.currency} ${parsed.amount}. Dime tracks rupees only, so add it manually with the rupee amount.`,
    });
  } catch (err) {
    log.error('ingest_notify_failed', { jobId: input.jobId, err });
  }
  return { transactionId: null, created: false, needsReview: review };
}

async function finish(ctx: TxContext, input: FinishInput): Promise<JobOutcome> {
  const { parsed } = input;
  const settings = settingsFromRow(await fetchByUserId(ctx.db, ctx.userId));
  if (parsed.currency !== 'INR') return needsRupees(ctx, settings, input);
  const lowConfidence = parsed.confidence < LOW_CONFIDENCE;
  const tz = await resolveUserTimezone(ctx.db, ctx.userId, input.timezone);
  const captured = { ms: input.capturedAtMs, iso: new Date(input.capturedAtMs).toISOString() };
  const captureDay = dateKey(localDate(tz, input.capturedAtMs));
  // A printed date (a receipt's) is a DAY, not an instant: it is the row's local date as it stands, and the instant is local
  // noon (never UTC midnight, which is the wrong day in half the world). Voice has the capture date as its reference, so
  // "today" comes back as today's date: the capture time says more, and is right in every timezone.
  const printedDay = parsed.dateOnly && !(input.detectedVia === 'voice' && parsed.dateOnly === captureDay) ? parsed.dateOnly : null;
  const transactionAt = printedDay
    ? { ms: startOfLocalDay(tz, parseDateKey(printedDay)) + 12 * 3_600_000, iso: new Date(startOfLocalDay(tz, parseDateKey(printedDay)) + 12 * 3_600_000).toISOString() }
    : (parsed.date && !parsed.dateOnly ? parsed.date : captured);
  const result = await createTransaction(
    {
      ...ctx,
      // The capture runs on the queue, so the budget alerts are reconciled right here (and awaited) once the row exists.
      afterWrite: (months) => reconcileUserBudgetAlerts(ctx.db, ctx.userId, months, { publish: ctx.publish, timezone: tz }),
    },
    {
      amount: parsed.amount,
      type: parsed.type,
      kind: captureKind(parsed, settings),
      counterpartyName: parsed.counterpartyName,
      counterpartyType: parsed.counterpartyType,
      categoryId: parsed.categoryId,
      categoryName: parsed.category,
      note: parsed.note,
      transactionAt,
      ...(printedDay ? { localDate: printedDay } : {}),
      timezone: tz,
      detectedVia: input.detectedVia,
      receiptUrl: input.receiptUrl ?? null,
      voiceUrl: input.voiceUrl ?? null,
      paymentHash: jobIdentity(input.jobId),
      // A parse the model was unsure of is saved, but flagged for the user to check.
      needsReview: lowConfidence,
    },
  );
  if (result.kind === 'existing') return { transactionId: result.id, created: false };

  // The row exists now: nothing after this point may fail the job (a retry would re-run the AI calls).
  try {
    const category = result.categoryId ? (await fetchMetaByIds(ctx.db, [result.categoryId], ctx.userId)).get(result.categoryId.toLowerCase()) : undefined;
    await createEmitter(ctx.db, ctx.userId, settings, undefined, ctx.publish).transactionAuto({
      transactionId: result.id,
      title: titleForAutoTx(parsed.amount),
      body: bodyForAutoTx({ merchant: parsed.counterpartyName, category: category?.name ?? null, possibleDuplicate: result.possibleDuplicateOf !== null, lowConfidence }),
    });
  } catch (err) {
    log.error('ingest_notify_failed', { jobId: input.jobId, transactionId: result.id, err });
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
    // A re-run of a job that already made its row (the queue redelivered, or marking it done failed) must not call the AI or
    // insert again: the job's identity names the row.
    const made = await txRepo.findByPaymentHash(db, job.user_id, jobIdentity(job.id));
    if (made) return { transactionId: made.id, created: false };
    const payload = mediaPayloadSchema.safeParse(job.payload);
    if (!payload.success) throw new InvalidJobError('Job payload is invalid.');
    const p = payload.data;
    // Offline captures are processed long after the fact: "today" means the day it was captured.
    const capturedAtMs = captureTime(p.captured_at);
    const reference = referenceDate(p.timezone, capturedAtMs);
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
      const parsed = await parseReceipt(config, workersAi, { bytes: media, mimeType: p.mime_type }, categories, reference);
      return finish(ctx, { jobId: job.id, parsed, detectedVia: 'scan', timezone: p.timezone, capturedAtMs, receiptUrl: p.object_path });
    }
    const [media, categories] = await Promise.all([
      downloadMedia(storage, p.object_path),
      loadCategoryContext(db, job.user_id),
    ]);
    await assertJobAllowed(db, config.workersAi, estimateCaptureNeurons('voice', media.byteLength));
    const parsed = await parseVoice(config, workersAi, media, p.mime_type, categories, reference);
    return finish(ctx, { jobId: job.id, parsed, detectedVia: 'voice', timezone: p.timezone, capturedAtMs, voiceUrl: p.object_path });
  }

  throw new InvalidJobError(`Unsupported job kind '${job.kind}'.`);
}
