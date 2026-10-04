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
