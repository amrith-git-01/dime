import type { Bindings } from '../../core/env';
import { log } from '../../core/logging';
import { isTransientError } from '../ingest/consumer';
import type { ReportMessage } from '../reports/fanout';
import { deliverReport } from '../reports/service';
import { emailMessageSchema } from './digest';
import { digestPeriodFromKey } from './periods';
import { emailConfigured, createEmailDeps, sendDigest } from './service';
import type { EmailDeps } from './service';

/** Messages of one batch processed at the same time (I/O bound: D1 + Brevo). */
const BATCH_CONCURRENCY = 3;
const RETRY_BASE_SECONDS = 30;
const RETRY_MAX_SECONDS = 600;

/** The slice of `Message` the consumer needs (lets tests pass plain fakes). */
export interface EmailMessageHandle {
  readonly id: string;
  readonly body: unknown;
  readonly attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

/** 30 s, 60 s, 120 s ... capped at 10 min, by delivery attempt (1-based). */
export function retryDelaySeconds(attempts: number): number {
  return Math.min(RETRY_BASE_SECONDS * 2 ** Math.max(0, attempts - 1), RETRY_MAX_SECONDS);
}

/**
 * A Broke Report message: build the month's snapshot (idempotent) and raise the notification (deduped), same ack/retry rules
 * as a digest: transient failures retry with backoff, permanent ones are logged and acked. No email is involved, so the
 * Brevo configuration is irrelevant here. Never throws.
 */
async function processReportMessage(message: EmailMessageHandle, report: ReportMessage, deps: EmailDeps): Promise<void> {
  const { user_id: userId, period_key: periodKey } = report;
  try {
    const outcome = await deliverReport({ db: deps.db, publisher: deps.publisher, pushSend: deps.pushSend }, { userId, periodKey });
    log.info('report_message_processed', { userId, periodKey, outcome });
    message.ack();
  } catch (err) {
    const transient = isTransientError(err);
    log.warn('report_message_failed', { userId, periodKey, attempt: message.attempts, transient, err });
    if (transient) message.retry({ delaySeconds: retryDelaySeconds(message.attempts) });
    else message.ack();
  }
}

/**
 * One queue message = one email (or one Broke Report). `sendDigest` claims `email_sends` first, so a duplicate or late
 * delivery is harmless. Outcomes:
 * - sent / skipped (no address, already claimed): ack;
 * - transient failure (Brevo 429/5xx, network, DB hiccup): the claim was released, `retry` with backoff;
 * - permanent failure (Brevo refused, bad data): the claim was released, logged, ack (no endless retries).
 * Never throws.
 */
export async function processEmailMessage(message: EmailMessageHandle, deps: EmailDeps): Promise<void> {
  const parsed = emailMessageSchema.safeParse(message.body);
  if (!parsed.success) {
    log.error('email_message_invalid', { messageId: message.id });
    message.ack(); // retrying a malformed message can never help
    return;
  }
  if (parsed.data.type === 'report') return processReportMessage(message, parsed.data, deps);
  const { user_id: userId, kind, period_key: periodKey } = parsed.data;
  const period = digestPeriodFromKey(kind, periodKey);
  if (!period) {
    log.error('email_message_bad_period', { messageId: message.id, kind, periodKey });
    message.ack();
    return;
  }
  if (!emailConfigured(deps.config, `digest:${kind}`)) {
    message.ack();
    return;
  }

  try {
    const outcome = await sendDigest(deps, { userId, period });
    log.info('email_digest_processed', { userId, kind, periodKey, outcome });
    message.ack();
  } catch (err) {
    const transient = isTransientError(err);
    log.warn('email_digest_failed', { userId, kind, periodKey, attempt: message.attempts, transient, err });
    if (transient) message.retry({ delaySeconds: retryDelaySeconds(message.attempts) });
    else message.ack();
  }
}

async function forEachLimited<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++] as T);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** `queue()` handler for `dime-email`. */
export async function handleEmailBatch(batch: MessageBatch<unknown>, env: Bindings): Promise<void> {
  const deps = createEmailDeps(env, env.DB);
  await forEachLimited(batch.messages, BATCH_CONCURRENCY, async (message) => {
    try {
      await processEmailMessage(message, deps);
    } catch (err) {
      // Defensive: processEmailMessage already handles its own failures.
      log.error('email_message_crashed', { err, messageId: message.id });
      message.retry({ delaySeconds: RETRY_BASE_SECONDS });
    }
  });
}

/**
 * `queue()` handler for `dime-email-dlq`: a digest the queue gave up on after its
 * retries. Every failed attempt already released its `email_sends` claim (and a claim left behind by
 * a crashed Worker is reclaimed after 30 minutes), so there is nothing to undo: log it for
 * `wrangler tail` / Workers Logs and ack. Idempotent, touches no external service, never throws.
 */
export function handleEmailDlq(batch: MessageBatch<unknown>): void {
  for (const message of batch.messages) {
    const parsed = emailMessageSchema.safeParse(message.body);
    if (!parsed.success) {
      log.error('email_dlq_message_invalid', { messageId: message.id, attempts: message.attempts });
    } else if (parsed.data.type === 'report') {
      const { user_id: userId, period_key: periodKey } = parsed.data;
      // Nothing to undo: the snapshot is immutable and the notification is deduped, so a later open still builds it.
      log.error('report_dead_lettered', { messageId: message.id, userId, periodKey, attempts: message.attempts });
    } else {
      const { user_id: userId, kind, period_key: periodKey } = parsed.data;
      log.error('email_digest_dead_lettered', { messageId: message.id, userId, kind, periodKey, attempts: message.attempts });
    }
    message.ack();
  }
}
