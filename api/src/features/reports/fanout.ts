import * as z from 'zod';

import type { Db } from '../../core/db';
import { log } from '../../core/logging';
import { localDate } from '../../core/timezone';
import { IST, digestPeriodFromKey, previousMonthPeriod } from '../email/periods';
import { listReportUserPages } from './repository';
import { MIN_REPORT_DEBITS } from './schemas';

/**
 * Broke Report fan-out: the daily digest cron also puts ONE `report` message per eligible user on `EMAIL_QUEUE` on IST
 * days 1 to 3 (and `POST /internal/reports/run` does the same on demand). The consumer builds the snapshot and raises the
 * notification. The report is built for every user with enough debits, whatever their alert setting; only users whose
 * report is not finished (no current-version row with `notified_at` set) are selected, so a missed or partly failed run
 * (snapshot or notification) is repaired by the next day's run without duplicates. Messages carry only `(user, period_key)`, so a retried message still describes the same month.
 */

export const reportMessageSchema = z.object({
  type: z.literal('report'),
  user_id: z.string().min(1),
  period_key: z.string().regex(/^\d{4}-\d{2}$/),
});
export type ReportMessage = z.infer<typeof reportMessageSchema>;

/** `Queue.sendBatch` accepts at most 100 messages per call (same limit as `SEND_BATCH_LIMIT` in the digest fan-out). */
const SEND_BATCH_LIMIT = 100;

/** IST days of the month on which the cron fans out: the 1st, and two catch-up days for a run that missed someone. */
export const REPORT_FANOUT_LAST_DAY = 3;

export function isReportFanOutDay(nowMs: number): boolean {
  return localDate(IST, nowMs).day <= REPORT_FANOUT_LAST_DAY;
}

export interface ReportFanOutResult {
  periodKey: string;
  /** Users picked (eligible, report not finished yet). */
  selected: number;
  /** Messages the queue accepted. */
  queued: number;
  /** Messages of chunks the queue refused (those users are picked again by the next run). */
  failed: number;
}

/**
 * Queue a `report` message for every user with `MIN_REPORT_DEBITS`+ debits in the month whose report is not finished yet.
 * The month is the previous IST month unless `periodKey` names another finished one. A queue failure on one chunk of 100
 * does not stop the others. Re-running is safe: the consumer's snapshot insert and the notification dedupe key make a
 * repeat a no-op, and users whose report is finished are not selected.
 */
export async function fanOutReports(input: {
  db: Db;
  /** The slice of the `EMAIL_QUEUE` binding used here. */
  queue: { sendBatch(messages: Iterable<{ body: ReportMessage }>): Promise<unknown> };
  nowMs: number;
  periodKey?: string | undefined;
}): Promise<ReportFanOutResult> {
  const period = (input.periodKey ? digestPeriodFromKey('monthly', input.periodKey) : null) ?? previousMonthPeriod(input.nowMs);
  const result: ReportFanOutResult = { periodKey: period.periodKey, selected: 0, queued: 0, failed: 0 };
  let pages = 0;
  for await (const page of listReportUserPages(input.db, period.range, period.periodKey, MIN_REPORT_DEBITS)) {
    pages += 1;
    result.selected += page.length;
    for (let i = 0; i < page.length; i += SEND_BATCH_LIMIT) {
      const batch = page.slice(i, i + SEND_BATCH_LIMIT).map((userId) => ({
        body: { type: 'report' as const, user_id: userId, period_key: period.periodKey },
      }));
      try {
        await input.queue.sendBatch(batch);
        result.queued += batch.length;
      } catch (err) {
        result.failed += batch.length;
        log.error('report_fanout_chunk_failed', { err, periodKey: period.periodKey, users: batch.length });
      }
    }
  }
  log.info('report_fanout', { ...result, pages, istDay: localDate(IST, input.nowMs).day });
  return result;
}
