import { app } from './app';
import type { Bindings } from './core/env';
import { log } from './core/logging';
import { handleEmailBatch, handleEmailDlq } from './features/email/consumer';
import { runDigestCron } from './features/email/digest';
import { handleIngestBatch, handleIngestDlq } from './features/ingest/consumer';
import { SWEEP_CRON, runSweep } from './features/ingest/sweep';
import { postDueRecurring } from './features/recurring/poster';

export { UserHub } from './features/realtime/user-hub';

/** Cron `30 2 * * *` (08:00 IST): weekly (Monday) / monthly (1st) email digest fan-out onto EMAIL_QUEUE. */
const EMAIL_DIGEST_CRON = '30 2 * * *';

export default {
  fetch: app.fetch,

  // Queues are told apart by name (a `-dlq` queue is matched before its parent).
  async queue(batch, env, _ctx) {
    if (batch.queue.startsWith('dime-ingest-dlq')) return handleIngestDlq(batch, env);
    if (batch.queue.startsWith('dime-ingest')) return handleIngestBatch(batch, env);

    if (batch.queue.startsWith('dime-email-dlq')) return handleEmailDlq(batch);
    if (batch.queue.startsWith('dime-email')) return handleEmailBatch(batch, env);

    // An unknown queue: ack so nothing is retried or DLQ'd forever.
    log.warn('queue_unknown', { queue: batch.queue, messages: batch.messages.length });
    batch.ackAll();
  },

  async scheduled(controller, env, _ctx) {
    switch (controller.cron) {
      case SWEEP_CRON:
        // Independent jobs on the same 5-minute tick: one failing must not skip the other.
        for (const result of await Promise.allSettled([runSweep(env, controller.scheduledTime), postDueRecurring(env, controller.scheduledTime)])) {
          if (result.status === 'rejected') throw result.reason;
        }
        return;
      case EMAIL_DIGEST_CRON:
        await runDigestCron(env, controller.scheduledTime);
        return;
      default:
        log.warn('scheduled_unknown_cron', { cron: controller.cron });
    }
  },
} satisfies ExportedHandler<Bindings>;
