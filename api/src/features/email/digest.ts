import * as z from 'zod';

import type { AppConfig, Bindings } from '../../core/env';
import { getConfig } from '../../core/env';
import { log } from '../../core/logging';
import type { Db } from '../../core/db';
import { fanOutReports, isReportFanOutDay, reportMessageSchema } from '../reports/fanout';
import { emailConfigured } from './service';
import { digestPeriodNow, dueDigestKinds } from './periods';
import { queueUserPages } from './queue-fanout';
import type { BatchQueue, FanOutCounts } from './queue-fanout';
import { listDigestUserPages } from './sends-repository';
import type { DigestKind } from './tokens';

/**
 * Digest fan-out: the cron (and `POST /internal/email/run`) puts ONE message per opted-in user on
 * `EMAIL_QUEUE`; the consumer sends each email. Messages carry only `(user, kind, period_key)`.
 * The same queue also carries the monthly `report` messages (Broke Report, see `features/reports/fanout.ts`).
 */

export const digestMessageSchema = z.object({
  type: z.literal('digest'),
  user_id: z.string().min(1),
  kind: z.enum(['weekly', 'monthly']),
  period_key: z.string().min(1),
});
export type DigestMessage = z.infer<typeof digestMessageSchema>;

/** Everything `EMAIL_QUEUE` carries, told apart by `type`. */
export const emailMessageSchema = z.discriminatedUnion('type', [digestMessageSchema, reportMessageSchema]);
export type EmailMessage = z.infer<typeof emailMessageSchema>;

/** `selected`: users who have the digest on and whose email for the period is not sent yet; `failed`: messages of chunks the queue refused. */
export interface FanOutResult extends FanOutCounts {
  kind: DigestKind;
  periodKey: string;
}

/**
 * Queue the digest of `kind` for every user who has it enabled and whose email for the period is not sent yet, for the period that
 * ends before `nowMs` (IST). Skipped (nothing queued) when Brevo or the unsubscribe secret is not configured. Re-running is safe:
 * the consumer's `email_sends` claim lets each user's email go out once per period. Shares its loop with the Broke Report fan-out
 * (`queueUserPages`): a chunk the queue refuses is counted in `failed`, never stops the rest.
 */
export async function fanOutDigest(input: {
  db: Db;
  /** The slice of the `EMAIL_QUEUE` binding used here. */
  queue: BatchQueue<DigestMessage>;
  config: AppConfig;
  kind: DigestKind;
  nowMs: number;
}): Promise<FanOutResult> {
  const period = digestPeriodNow(input.kind, input.nowMs);
  const result: FanOutResult = { kind: input.kind, periodKey: period.periodKey, selected: 0, queued: 0, failed: 0, pages: 0 };
  if (!emailConfigured(input.config, `digest:${input.kind}`)) return result;

  Object.assign(
    result,
    await queueUserPages<DigestMessage>({
      queue: input.queue,
      pages: listDigestUserPages(input.db, input.kind, period.periodKey),
      message: (userId) => ({ type: 'digest', user_id: userId, kind: input.kind, period_key: period.periodKey }),
      label: 'email_digest_fanout',
      context: { kind: input.kind, periodKey: period.periodKey },
    }),
  );
  log.info('email_digest_fanout', { ...result });
  return result;
}

/**
 * Cron entry point: whichever digests are due on this IST day (Monday to Wednesday weekly, days 1 to 3 monthly: the later days only
 * pick up users still missing their email), plus the Broke Report fan-out on IST days 1 to 3 (likewise). A failure in one does not
 * skip the other; the first error is rethrown at the end so the run is still reported as failed.
 */
export async function runDigestCron(env: Bindings, scheduledTimeMs: number): Promise<FanOutResult[]> {
  const results: FanOutResult[] = [];
  let failure: { err: unknown } | undefined;

  const kinds = dueDigestKinds(scheduledTimeMs);
  if (kinds.length > 0) {
    const config = getConfig(env);
    try {
      for (const kind of kinds) {
        const result = await fanOutDigest({ db: env.DB, queue: env.EMAIL_QUEUE, config, kind, nowMs: scheduledTimeMs });
        results.push(result);
        if (result.failed > 0) failure ??= { err: new Error(`${kind} digest fan-out: ${result.failed} of ${result.selected} messages not queued`) };
      }
    } catch (err) {
      failure = { err };
    }
  }

  if (isReportFanOutDay(scheduledTimeMs)) {
    try {
      const report = await fanOutReports({ db: env.DB, queue: env.EMAIL_QUEUE, nowMs: scheduledTimeMs });
      if (report.failed > 0) failure ??= { err: new Error(`report fan-out: ${report.failed} of ${report.selected} messages not queued`) };
    } catch (err) {
      log.error('report_fanout_failed', { err });
      failure ??= { err };
    }
  }

  if (failure) throw failure.err;
  return results;
}
