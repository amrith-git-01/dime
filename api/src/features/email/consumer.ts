import type { Bindings } from '../../core/env';
import { log } from '../../core/logging';
import { isTransientError } from '../ingest/consumer';
import { digestMessageSchema } from './digest';
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
 * One queue message = one email. `sendDigest` claims `email_sends` first, so a duplicate or late
 * delivery is harmless. Outcomes:
 * - sent / skipped (no address, already claimed): ack;
 * - transient failure (Brevo 429/5xx, network, DB hiccup): the claim was released, `retry` with backoff;
 * - permanent failure (Brevo refused, bad data): the claim was released, logged, ack (no endless retries).
 * Never throws.
 */
export async function processEmailMessage(message: EmailMessageHandle, deps: EmailDeps): Promise<void> {
  const parsed = digestMessageSchema.safeParse(message.body);
  if (!parsed.success) {
    log.error('email_message_invalid', { messageId: message.id });
    message.ack(); // retrying a malformed message can never help
    return;
  }
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

/** `queue()` handler for `dime-email` (and `dime-email-staging`). */
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
 * `queue()` handler for `dime-email-dlq` (and staging): a digest the queue gave up on after its
 * retries. Every failed attempt already released its `email_sends` claim (and a claim left behind by
 * a crashed Worker is reclaimed after 30 minutes), so there is nothing to undo: log it for
 * `wrangler tail` / Workers Logs and ack. Idempotent, touches no external service, never throws.
 */
export function handleEmailDlq(batch: MessageBatch<unknown>): void {
  for (const message of batch.messages) {
    const parsed = digestMessageSchema.safeParse(message.body);
    if (parsed.success) {
      const { user_id: userId, kind, period_key: periodKey } = parsed.data;
      log.error('email_digest_dead_lettered', { messageId: message.id, userId, kind, periodKey, attempts: message.attempts });
    } else {
      log.error('email_dlq_message_invalid', { messageId: message.id, attempts: message.attempts });
    }
    message.ack();
  }
}
