import { getConfig } from '../../core/env';
import type { AppConfig, Bindings } from '../../core/env';
import { UpstreamError } from '../../core/errors';
import { log } from '../../core/logging';
import type { Db } from '../../core/db';
import { isTransientDbError } from '../../core/db-errors';
import { mediaStore } from '../media/storage';
import type { MediaStore } from '../media/storage';
import { AiError } from '../ai/errors';
import type { AiBinding } from '../ai/workers-ai';
import * as jobs from '../jobs/repository';
import type { JobKind, JobRow } from '../jobs/repository';
import type { Publisher } from '../realtime/events';
import { envPublisher } from '../realtime/publish';
import { createEmitter } from '../notifications/emitter';
import { fetchByUserId } from '../user-settings/repository';
import { settingsFromRow } from '../user-settings/snapshot';
import { InvalidJobError, runIngestJob } from './pipeline';
import type { IngestStores, JobOutcome } from './pipeline';
import { MAX_JOB_ATTEMPTS, ingestMessageSchema } from './schemas';

/** Messages of one batch processed at the same time (the work is I/O bound). */
const BATCH_CONCURRENCY = 3;
/** Queue redelivery delay after a transient failure, indexed by the attempt that just failed. */
const RETRY_DELAYS_SECONDS = [5, 10, 30] as const;
const CLAIM_ERROR_RETRY_SECONDS = 10;
const DLQ_RETRY_SECONDS = 30;

/** The slice of `Message` the consumer needs (lets tests pass plain fakes). */
export interface IngestMessageHandle {
  readonly id: string;
  readonly body: unknown;
  readonly attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

export interface IngestDeps {
  db: Db;
  storage: MediaStore;
  ai?: AiBinding;
  config: AppConfig;
  publisher?: Publisher | undefined;
  /** Overridable for tests. */
  run?: (stores: IngestStores, config: AppConfig, job: JobRow) => Promise<JobOutcome>;
}

function isNetworkFailure(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === 'TimeoutError' || err.name === 'AbortError';
  const message = err instanceof Error ? err.message : '';
  return /fetch failed|network|timed? ?out|ECONN|ETIMEDOUT/i.test(message);
}

/**
 * Retryable failures: transient AI/upstream errors, network problems and database hiccups
 * (D1 reports overload and network resets in the error message).
 */
export function isTransientError(err: unknown): boolean {
  if (err instanceof AiError) return err.transient;
  if (err instanceof InvalidJobError) return false;
  if (err instanceof UpstreamError) return true;
  return isTransientDbError(err) || isNetworkFailure(err);
}

function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

const FAILURE_COPY = {
  receipt: { source: 'scan', title: 'Receipt scan failed', body: "We couldn't read this receipt. Try again or add manually." },
  sms: { source: 'sms', title: 'SMS capture failed', body: "We couldn't read this bank message. Try again or add manually." },
} as const;

/** `capture_failed` notification (deduped per day by the emitter). Voice failures raise none. Never throws. */
async function notifyCaptureFailed(db: Db, userId: string, kind: JobKind): Promise<void> {
  if (kind !== 'receipt' && kind !== 'sms') return;
  const copy = FAILURE_COPY[kind];
  try {
    const settings = settingsFromRow(await fetchByUserId(db, userId));
    await createEmitter(db, userId, settings).captureFailed({
      source: copy.source,
      title: copy.title,
      body: copy.body,
      dayKey: new Date().toISOString().slice(0, 10),
    });
  } catch (err) {
    log.error('capture_failed_notification_failed', { err, userId });
  }
}

/** Run `fn` over `items` with at most `limit` in flight. `fn` must not reject. */
async function forEachLimited<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++] as T);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * One queue message = one job id. Claim (pending -> processing) so duplicate or late deliveries are
 * harmless, run the pipeline, then:
 * - success: `done` with `{transaction_id}`;
 * - transient error on a non-final attempt: release to `pending` and `retry` with backoff;
 * - permanent error or final attempt: `failed` + `capture_failed` notification (receipt, sms).
 * Every path acks or retries the message; nothing throws.
 */
export async function processIngestMessage(message: IngestMessageHandle, deps: IngestDeps): Promise<void> {
  const parsed = ingestMessageSchema.safeParse(message.body);
  if (!parsed.success) {
    log.error('ingest_message_invalid', { messageId: message.id });
    message.ack(); // retrying a malformed message can never help
    return;
  }
  const { db, config } = deps;
  const jobId = parsed.data.job_id;

  let job: JobRow | null;
  try {
    job = await jobs.claimJob(db, jobId, MAX_JOB_ATTEMPTS);
  } catch (err) {
    log.warn('ingest_claim_failed', { err, jobId });
    message.retry({ delaySeconds: CLAIM_ERROR_RETRY_SECONDS });
    return;
  }
  if (!job) {
    message.ack(); // someone else holds it, it is finished, or its attempts are spent
    return;
  }

  try {
    const outcome = await (deps.run ?? runIngestJob)({ db, storage: deps.storage, ai: deps.ai, publisher: deps.publisher }, config, job);
    await jobs.markDone(db, job.id, { transaction_id: outcome.transactionId });
    message.ack();
    return;
  } catch (err) {
    await handleFailure(message, deps, job, err);
  }
}

async function handleFailure(message: IngestMessageHandle, deps: IngestDeps, job: JobRow, err: unknown): Promise<void> {
  const { db } = deps;
  const transient = isTransientError(err);
  const finalAttempt = job.attempts >= MAX_JOB_ATTEMPTS;
  log.warn('ingest_job_failed', { jobId: job.id, kind: job.kind, attempt: job.attempts, transient, finalAttempt, err });

  if (transient && !finalAttempt) {
    const delaySeconds = RETRY_DELAYS_SECONDS[Math.min(job.attempts, RETRY_DELAYS_SECONDS.length) - 1] ?? 30;
    try {
      await jobs.releaseJob(db, job.id); // back to pending so the redelivery can claim it
    } catch (releaseErr) {
      // Still `processing`: the sweep requeues it after 120 s; the redelivery below finds it held and acks.
      log.error('ingest_release_failed', { err: releaseErr, jobId: job.id });
    }
    message.retry({ delaySeconds });
    return;
  }

  try {
    await jobs.markFailed(db, job.id, describeError(err));
  } catch (markErr) {
    log.error('ingest_mark_failed_failed', { err: markErr, jobId: job.id });
  }
  await notifyCaptureFailed(db, job.user_id, job.kind);
  message.ack();
}

/** `queue()` handler for `dime-ingest`. */
export async function handleIngestBatch(batch: MessageBatch<unknown>, env: Bindings): Promise<void> {
  const deps: IngestDeps = { db: env.DB, storage: mediaStore(env), ai: env.AI, config: getConfig(env), publisher: envPublisher(env) };
  await forEachLimited(batch.messages, BATCH_CONCURRENCY, async (message) => {
    try {
      await processIngestMessage(message, deps);
    } catch (err) {
      // Defensive: processIngestMessage already handles its own failures.
      log.error('ingest_message_crashed', { err, messageId: message.id });
      message.retry({ delaySeconds: CLAIM_ERROR_RETRY_SECONDS });
    }
  });
}

/**
 * `queue()` handler for `dime-ingest-dlq`: a message lands here after the queue gave up on it. Mark
 * its job failed (only if still unfinished, so a late success is never overwritten), tell the user,
 * and ack.
 */
export async function handleIngestDlq(batch: MessageBatch<unknown>, env: Bindings): Promise<void> {
  const db = env.DB;
  await forEachLimited(batch.messages, BATCH_CONCURRENCY, async (message) => {
    const parsed = ingestMessageSchema.safeParse(message.body);
    if (!parsed.success) {
      log.error('ingest_dlq_message_invalid', { messageId: message.id });
      message.ack();
      return;
    }
    try {
      const failed = await jobs.failIfUnfinished(db, parsed.data.job_id, 'Dead-lettered: queue delivery retries exhausted');
      if (failed) {
        log.error('ingest_job_dead_lettered', { jobId: failed.id, kind: failed.kind });
        await notifyCaptureFailed(db, failed.user_id, failed.kind);
      }
      message.ack();
    } catch (err) {
      log.error('ingest_dlq_failed', { err, jobId: parsed.data.job_id });
      message.retry({ delaySeconds: DLQ_RETRY_SECONDS });
    }
  });
}
