import { log } from '../../core/logging';
import type { IngestMessage } from './schemas';

/** `Queue.sendBatch` accepts at most 100 messages per call. */
const SEND_BATCH_LIMIT = 100;

/**
 * Put job ids on the ingest queue. The jobs are already persisted as `pending`, so a failure here is
 * logged and swallowed: the recovery sweep (cron) re-sends anything still pending after 120 s.
 * Returns whether every message was accepted by the queue.
 */
export async function enqueueJobs(queue: Queue, jobs: readonly IngestMessage[]): Promise<boolean> {
  if (jobs.length === 0) return true;
  try {
    if (jobs.length === 1) {
      await queue.send(jobs[0]);
      return true;
    }
    for (let i = 0; i < jobs.length; i += SEND_BATCH_LIMIT) {
      await queue.sendBatch(jobs.slice(i, i + SEND_BATCH_LIMIT).map((body) => ({ body })));
    }
    return true;
  } catch (err) {
    log.error('ingest_enqueue_failed', { err, jobs: jobs.length });
    return false;
  }
}
