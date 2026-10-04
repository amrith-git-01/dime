import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';

import { getConfig } from './env';
import type { AppBindings } from './env';

type CorsHandler = ReturnType<typeof cors>;
const handlers = new Map<string, CorsHandler>();

/**
 * CORS is opt-in (the mobile app needs none): with `CORS_ORIGINS` empty this adds no headers and
 * costs one config lookup. Credentials stay off (bearer tokens, no cookies).
 */
export const corsFromEnv = createMiddleware<AppBindings>(async (c, next) => {
  const origins = getConfig(c.env).corsOrigins;
  if (origins.length === 0) return next();
  const key = origins.join(',');
  let handler = handlers.get(key);
  if (!handler) {
    handler = cors({ origin: origins, credentials: false, allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] });
    handlers.set(key, handler);
  }
  return handler(c, next);
});
