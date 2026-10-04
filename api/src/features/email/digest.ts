import * as z from 'zod';

import type { AppConfig, Bindings } from '../../core/env';
import { getConfig } from '../../core/env';
import { log } from '../../core/logging';
import { createServiceClient } from '../../core/supabase';
import type { DimeSupabaseClient } from '../../core/supabase';
import { emailConfigured } from './service';
import { digestPeriodNow, dueDigestKinds } from './periods';
import { listDigestUserPages } from './sends-repository';
import type { DigestKind } from './tokens';

/**
 * Digest fan-out: the cron (and `POST /internal/email/run`) puts ONE message per opted-in user on
 * `EMAIL_QUEUE`; the consumer sends each email. Messages carry only `(user, kind, period_key)`.
 */

export const digestMessageSchema = z.object({
  type: z.literal('digest'),
  user_id: z.string().min(1),
  kind: z.enum(['weekly', 'monthly']),
  period_key: z.string().min(1),
});
export type DigestMessage = z.infer<typeof digestMessageSchema>;

/** `Queue.sendBatch` accepts at most 100 messages per call. */
export const SEND_BATCH_LIMIT = 100;

export interface FanOutResult {
  kind: DigestKind;
  periodKey: string;
  queued: number;
}

/**
 * Queue the digest of `kind` for every user who has it enabled, for the period that ends before `nowMs`
 * (IST). Skipped (0 queued) when Brevo or the unsubscribe secret is not configured. Re-running is safe:
 * the consumer's `email_sends` claim lets each user's email go out once per period.
 */
export async function fanOutDigest(input: {
  db: DimeSupabaseClient;
  /** The slice of the `EMAIL_QUEUE` binding used here. */
  queue: { sendBatch(messages: Iterable<{ body: DigestMessage }>): Promise<unknown> };
  config: AppConfig;
  kind: DigestKind;
  nowMs: number;
}): Promise<FanOutResult> {
  const period = digestPeriodNow(input.kind, input.nowMs);
  const result: FanOutResult = { kind: input.kind, periodKey: period.periodKey, queued: 0 };
  if (!emailConfigured(input.config, `digest:${input.kind}`)) return result;

  for await (const page of listDigestUserPages(input.db, input.kind)) {
    for (let i = 0; i < page.length; i += SEND_BATCH_LIMIT) {
      const batch = page.slice(i, i + SEND_BATCH_LIMIT).map((userId) => ({
        body: { type: 'digest' as const, user_id: userId, kind: input.kind, period_key: period.periodKey },
      }));
      await input.queue.sendBatch(batch);
      result.queued += batch.length;
    }
  }
  log.info('email_digest_fanout', { ...result });
  return result;
}

/** Cron entry point: whichever digests are due on this IST day. */
export async function runDigestCron(env: Bindings, scheduledTimeMs: number): Promise<FanOutResult[]> {
  const kinds = dueDigestKinds(scheduledTimeMs);
  if (kinds.length === 0) return [];
  const db = createServiceClient(env);
  const config = getConfig(env);
  const results: FanOutResult[] = [];
  for (const kind of kinds) {
    results.push(await fanOutDigest({ db, queue: env.EMAIL_QUEUE, config, kind, nowMs: scheduledTimeMs }));
  }
  return results;
}
