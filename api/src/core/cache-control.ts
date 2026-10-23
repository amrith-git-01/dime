import { createMiddleware } from 'hono/factory';

import type { AppBindings } from './env';

/**
 * Every API response is per-user (bearer token) or a one-off (signed links, cron): no browser,
 * proxy or CDN may store it. That includes JSON GETs that carry an `ETag` (see `etag.ts`): they stay
 * `no-store` on purpose, so an OS URL cache (iOS NSURLCache) never persists a user's data to disk;
 * the app revalidates with `If-None-Match` itself and keeps its own bodies in memory. Runs after the
 * handler so error and 404 responses get it too; the `Vary` is appended so CORS's `Vary: Origin` survives.
 */
export const noStore = createMiddleware<AppBindings>(async (c, next) => {
  await next();
  // A WebSocket upgrade response cannot be rebuilt (copying it would drop the socket).
  if (c.res.status === 101) return;
  // A handler that chose its own policy (immutable, content-addressed update assets) keeps it.
  if (c.res.headers.has('Cache-Control')) return;
  c.header('Cache-Control', 'private, no-store');
  c.header('Vary', 'Authorization', { append: true });
});
