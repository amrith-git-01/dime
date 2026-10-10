import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';

import { getConfig } from './env';
import type { AppBindings, AppConfig } from './env';

/** Multipart envelope overhead on top of the file cap (boundaries, field parts), as in the Python API. */
export const MULTIPART_ENVELOPE_BYTES = 256 * 1024;

/**
 * Per-route request body cap. Checks `Content-Length` first and, for chunked bodies, counts bytes
 * while the body is read. Responds 413 `{"detail":"Request body too large."}`.
 *   router.post('/x', limitBody(64 * 1024), handler)
 */
export const limitBody = (maxBytes: number) =>
  bodyLimit({
    maxSize: maxBytes,
    onError: (c) => c.json({ detail: 'Request body too large.' }, 413),
  });

/**
 * Upload cap taken from config (plus multipart envelope):
 *   router.post('/receipt', limitUpload((cfg) => cfg.maxReceiptUploadBytes), handler)
 */
export const limitUpload = (select: (config: AppConfig) => number) =>
  createMiddleware<AppBindings>((c, next) =>
    limitBody(select(getConfig(c.env)) + MULTIPART_ENVELOPE_BYTES)(c, next),
  );

/** Cap for ordinary JSON bodies: far above anything the app sends (a transaction, a budget, a category). */
export const JSON_BODY_LIMIT_BYTES = 64 * 1024;

/**
 * Global cap for `/api/v1/*`. Multipart uploads (receipt, voice, avatar) and the agent chat keep the larger limits
 * they set themselves; everything else is held to `JSON_BODY_LIMIT_BYTES`.
 */
export const limitJsonBody = createMiddleware<AppBindings>((c, next) => {
  const multipart = (c.req.header('content-type') ?? '').toLowerCase().startsWith('multipart/');
  if (multipart || c.req.path.endsWith('/agent/chat')) return next();
  return limitBody(JSON_BODY_LIMIT_BYTES)(c, next);
});
