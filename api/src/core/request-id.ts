import { createMiddleware } from 'hono/factory';

import type { AppBindings } from './env';
import { log, logContext } from './logging';

export const REQUEST_ID_HEADER = 'X-Request-ID';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Outermost middleware. Accepts a safe incoming `X-Request-ID` (else generates one), echoes it on
 * every response, and opens the logging context. Also emits one access-log line per request.
 */
export const requestId = createMiddleware<AppBindings>(async (c, next) => {
  const incoming = c.req.header(REQUEST_ID_HEADER)?.trim();
  const id = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID().replaceAll('-', '');
  c.set('requestId', id);
  c.header(REQUEST_ID_HEADER, id);

  const start = Date.now();
  await logContext.run({ requestId: id }, async () => {
    await next();
    // Errors are already converted to a response by app.onError at this point.
    log.info('request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start,
    });
  });
});
