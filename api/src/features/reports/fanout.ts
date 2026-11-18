import * as z from 'zod';

import type { Db } from '../../core/db';
import { log } from '../../core/logging';
import { IST, localDate } from '../../core/timezone';
import { FANOUT_DAYS, digestPeriodFromKey, previousMonthPeriod } from '../email/periods';
import { queueUserPages } from '../email/queue-fanout';
import type { BatchQueue, FanOutCounts } from '../email/queue-fanout';
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

/** IST days of the month on which the cron fans out: the 1st, and two catch-up days for a run that missed someone (as for the digest). */
export const REPORT_FANOUT_LAST_DAY = FANOUT_DAYS;

export function isReportFanOutDay(nowMs: number): boolean {
  return localDate(IST, nowMs).day <= REPORT_FANOUT_LAST_DAY;
}

/** `selected`: users picked (eligible, report not finished yet); `failed`: messages of chunks the queue refused (picked again by the next run). */
export interface ReportFanOutResult extends FanOutCounts {
  periodKey: string;
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
  queue: BatchQueue<ReportMessage>;
  nowMs: number;
  periodKey?: string | undefined;
}): Promise<ReportFanOutResult> {
  const period = (input.periodKey ? digestPeriodFromKey('monthly', input.periodKey) : null) ?? previousMonthPeriod(input.nowMs);
  const counts = await queueUserPages<ReportMessage>({
    queue: input.queue,
    pages: listReportUserPages(input.db, period.dates, period.periodKey, MIN_REPORT_DEBITS),
    message: (userId) => ({ type: 'report', user_id: userId, period_key: period.periodKey }),
    label: 'report_fanout',
    context: { periodKey: period.periodKey },
  });
  const result: ReportFanOutResult = { periodKey: period.periodKey, ...counts };
  log.info('report_fanout', { ...result, istDay: localDate(IST, input.nowMs).day });
  return result;
}
