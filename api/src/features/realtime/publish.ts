import type { Context } from 'hono';

import { defer } from '../../core/background';
import type { AppBindings, Bindings } from '../../core/env';
import { log } from '../../core/logging';
import type { ChangeEvent, Publish, Publisher } from './events';

/** Deliver events to the user's `UserHub`. A failure is logged and swallowed: a broadcast never fails a write. */
export async function publishChanges(env: Bindings, userId: string, events: ChangeEvent[]): Promise<void> {
  if (events.length === 0 || !env.USER_HUB) return;
  try {
    await env.USER_HUB.get(env.USER_HUB.idFromName(userId)).broadcast(events);
  } catch (err) {
    log.error('realtime_publish_failed', { err, userId, events: events.length });
  }
}

/** For HTTP routes: the broadcast runs in `waitUntil`, after the response is on its way. */
export function requestPublisher(c: Context<AppBindings>, userId: string): Publish {
  return (events) => defer(c, publishChanges(c.env, userId, events), 'realtime_broadcast');
}

/** For the queue consumer: the caller awaits it (there is no response to protect there). */
export function envPublisher(env: Bindings): Publisher {
  return (userId, events) => publishChanges(env, userId, events);
}

/** Call `publish` and never throw. */
export async function emit(publish: Publish | undefined, events: ChangeEvent[]): Promise<void> {
  if (!publish || events.length === 0) return;
  try {
    await publish(events);
  } catch (err) {
    log.error('realtime_emit_failed', { err });
  }
}
