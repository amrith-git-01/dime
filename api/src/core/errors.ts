import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { AppBindings } from './env';
import { ConfigError } from './env';
import { log } from './logging';

/**
 * Domain errors, mapped to HTTP by `onError`. Services and repositories throw these; routes do not
 * wrap calls in try/catch. Response body is FastAPI-compatible: `{"detail": <message>}`.
 */
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly headers: Record<string, string> | undefined;

  constructor(status: ContentfulStatusCode, detail: string, options?: { headers?: Record<string, string>; cause?: unknown }) {
    super(detail, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.status = status;
    this.headers = options?.headers;
  }
}

export class BadRequestError extends AppError {
  constructor(detail = 'Bad request.') {
    super(400, detail);
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail = 'Not authenticated.') {
    super(401, detail, { headers: { 'WWW-Authenticate': 'Bearer' } });
  }
}

export class ForbiddenError extends AppError {
  constructor(detail = 'Forbidden.') {
    super(403, detail);
  }
}

export class NotFoundError extends AppError {
  constructor(detail = 'Not found.') {
    super(404, detail);
  }
}

export class ConflictError extends AppError {
  constructor(detail = 'Conflict.') {
    super(409, detail);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(detail = 'Request body too large.') {
    super(413, detail);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(detail = 'Unsupported media type.') {
    super(415, detail);
  }
}

/** Domain-level validation failure (string detail). Body/query schema failures use `validate()`. */
export class ValidationError extends AppError {
  constructor(detail = 'Invalid request.') {
    super(422, detail);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(detail = 'Too many requests', retryAfterSeconds = 10) {
    super(429, detail, { headers: { 'Retry-After': String(retryAfterSeconds) } });
  }
}

export class UpstreamError extends AppError {
  constructor(detail = 'Upstream service error.', options?: { status?: 502 | 504; cause?: unknown }) {
    super(options?.status ?? 502, detail, options?.cause === undefined ? undefined : { cause: options.cause });
  }
}

/** Temporary capacity/config problem; the client may retry. */
export class ServiceUnavailableError extends AppError {
  constructor(detail = 'Service is busy. Try again.', retryAfterSeconds?: number) {
    super(
      503,
      detail,
      retryAfterSeconds === undefined ? undefined : { headers: { 'Retry-After': String(retryAfterSeconds) } },
    );
  }
}

/** FastAPI returns 422 with a list for a body that is not valid JSON; keep that shape. */
function isMalformedJson(err: HTTPException): boolean {
  return err.status === 400 && err.message.startsWith('Malformed JSON');
}

export const onError: ErrorHandler<AppBindings> = (err, c) => {
  if (err instanceof AppError) {
    if (err.status >= 500) log.error('app_error', { err, status: err.status });
    return c.json({ detail: err.message }, err.status, err.headers);
  }

  if (err instanceof HTTPException) {
    if (err.res) return err.res; // caller built the response (e.g. custom headers)
    if (isMalformedJson(err)) {
      return c.json(
        { detail: [{ type: 'json_invalid', loc: ['body'], msg: 'JSON decode error' }] },
        422,
      );
    }
    if (err.status >= 500) log.error('http_exception', { err, status: err.status });
    return c.json({ detail: err.message }, err.status);
  }

  // Contract C8: never leak internals; correlate through the request id.
  log.error(err instanceof ConfigError ? 'config_error' : 'unhandled_exception', {
    err,
    method: c.req.method,
    path: c.req.path,
  });
  return c.json({ detail: 'Internal error', request_id: c.get('requestId') ?? null }, 500);
};

export const notFound: NotFoundHandler<AppBindings> = (c) => c.json({ detail: 'Not Found' }, 404);
