import type { Context } from 'hono';

import type { AppBindings } from './env';
import { log } from './logging';

/**
 * Fire-and-forget work that must outlive the response: `ctx.waitUntil` on Workers. A rejection is
 * logged, never surfaced to the client. Outside a Worker request (unit tests calling a router with
 * `app.request` and no ExecutionContext) the promise just runs detached.
 */
export function defer(c: Context<AppBindings>, task: Promise<unknown>, name: string): void {
  const guarded = task.catch((err: unknown) => {
    log.error('background_task_failed', { err, task: name });
  });
  let ctx: Pick<ExecutionContext, 'waitUntil'> | undefined;
  try {
    ctx = c.executionCtx;
  } catch {
    ctx = undefined; // Hono throws when the request has no ExecutionContext
  }
  if (ctx) ctx.waitUntil(guarded);
}
