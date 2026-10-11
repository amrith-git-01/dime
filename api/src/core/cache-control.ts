import { createMiddleware } from 'hono/factory';

import type { AppBindings } from './env';

/**
 * Every API response is per-user (bearer token) or a one-off (signed links, cron): no browser,
 * proxy or CDN may store it. Runs after the handler so error and 404 responses get it too; the
 * `Vary` is appended so CORS's `Vary: Origin` survives.
 */
export const noStore = createMiddleware<AppBindings>(async (c, next) => {
  await next();
  // A WebSocket upgrade response cannot be rebuilt (copying it would drop the socket).
  if (c.res.status === 101) return;
  c.header('Cache-Control', 'private, no-store');
  c.header('Vary', 'Authorization', { append: true });
});
