import { log } from '../../core/logging';

/** `Queue.sendBatch` accepts at most 100 messages per call. */
export const SEND_BATCH_LIMIT = 100;

/** The slice of the `EMAIL_QUEUE` binding a fan-out uses. */
export interface BatchQueue<M> {
  sendBatch(messages: Iterable<{ body: M }>): Promise<unknown>;
}

export interface FanOutCounts {
  /** Users the selection returned. */
  selected: number;
  /** Messages the queue accepted. */
  queued: number;
  /** Messages of chunks the queue refused (those users are selected again by the next run). */
  failed: number;
  pages: number;
}

/**
 * The shared fan-out loop of the digest and the Broke Report: one message per selected user, sent in chunks of 100. A chunk the queue
 * refuses is counted and logged (`<label>_chunk_failed`) and never stops the other chunks; the caller decides what a non-zero
 * `failed` means. The pages come from a keyset-paged selection (`user_id > ?`), so a run that changes who is selected as it goes
 * still visits everyone once.
 */
export async function queueUserPages<M>(input: {
  queue: BatchQueue<M>;
  pages: AsyncIterable<string[]>;
  message: (userId: string) => M;
  label: string;
  context: Record<string, unknown>;
}): Promise<FanOutCounts> {
  const counts: FanOutCounts = { selected: 0, queued: 0, failed: 0, pages: 0 };
  for await (const page of input.pages) {
    counts.pages += 1;
    counts.selected += page.length;
    for (let i = 0; i < page.length; i += SEND_BATCH_LIMIT) {
      const batch = page.slice(i, i + SEND_BATCH_LIMIT).map((userId) => ({ body: input.message(userId) }));
      try {
        await input.queue.sendBatch(batch);
        counts.queued += batch.length;
      } catch (err) {
        counts.failed += batch.length;
        log.error(`${input.label}_chunk_failed`, { err, ...input.context, users: batch.length });
      }
    }
  }
  return counts;
}
