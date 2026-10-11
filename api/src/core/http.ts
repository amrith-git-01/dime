import type { ZodType } from 'zod';

import { UpstreamError } from './errors';
import { log } from './logging';

export interface FetchOptions {
  method?: string;
  headers?: HeadersInit;
  /** Sent as JSON with `Content-Type: application/json`. */
  json?: unknown;
  /** Raw body (string, FormData, ArrayBuffer...). Must be re-sendable if `retries > 0`. */
  body?: BodyInit;
  /** Per-attempt timeout. Default 10s. */
  timeoutMs?: number;
  /** Extra attempts after the first. Default: 2 for GET/HEAD, 0 otherwise (not safe to repeat). */
  retries?: number;
  /** Retry on these upstream statuses (and on network errors/timeouts). */
  retryOnStatus?: readonly number[];
  /** First backoff in ms; doubles each attempt with jitter. Default 300. */
  backoffMs?: number;
  /** Label used in logs/errors, e.g. "deepseek". Never include secrets. */
  upstream?: string;
}

const DEFAULT_RETRY_STATUS = [408, 425, 429, 500, 502, 503, 504] as const;
const MAX_RETRY_AFTER_MS = 5000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryDelay(res: Response | undefined, attempt: number, base: number): number {
  const retryAfter = Number(res?.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS);
  return Math.min(base * 2 ** attempt, MAX_RETRY_AFTER_MS) * (0.5 + Math.random() / 2);
}

/**
 * fetch with a timeout, bounded retries and error mapping. Returns the first non-retryable
 * response (2xx or a 4xx) untouched, so callers can still read error bodies. Throws
 * `UpstreamError` (502/504) once attempts are exhausted on network error, timeout or a retryable status.
 */
export async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
  const method = (options.method ?? (options.json !== undefined || options.body !== undefined ? 'POST' : 'GET')).toUpperCase();
  const idempotent = method === 'GET' || method === 'HEAD';
  const retries = options.retries ?? (idempotent ? 2 : 0);
  const retryOn = options.retryOnStatus ?? DEFAULT_RETRY_STATUS;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const upstream = options.upstream ?? new URL(url).host;

  const headers = new Headers(options.headers);
  let body = options.body;
  if (options.json !== undefined) {
    body = JSON.stringify(options.json);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response | undefined;
    let lastFailure: string;
    try {
      res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
      if (!retryOn.includes(res.status)) return res;
      lastFailure = `status ${res.status}`;
    } catch (err) {
      const timedOut = err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError');
      lastFailure = timedOut ? 'timeout' : 'network error';
      if (attempt === retries) {
        throw new UpstreamError(`${upstream} request failed (${lastFailure}).`, {
          status: timedOut ? 504 : 502,
          cause: err,
        });
      }
    }
    if (attempt === retries) {
      await res?.body?.cancel();
      throw new UpstreamError(`${upstream} request failed (${lastFailure}).`);
    }
    log.warn('upstream_retry', { upstream, attempt: attempt + 1, reason: lastFailure });
    const delay = retryDelay(res, attempt, options.backoffMs ?? 300);
    await res?.body?.cancel();
    await sleep(delay);
  }
  // Unreachable: the loop always returns or throws.
  throw new UpstreamError(`${upstream} request failed.`);
}

/**
 * JSON request/response helper. Non-2xx after retries becomes `UpstreamError`; pass a zod schema to
 * validate the payload (invalid payload is also an `UpstreamError`, never a 500 with internals).
 */
export async function fetchJson<T = unknown>(
  url: string,
  options: FetchOptions & { schema?: ZodType<T> } = {},
): Promise<T> {
  const { schema, ...rest } = options;
  const upstream = rest.upstream ?? new URL(url).host;
  const res = await fetchWithRetry(url, rest);
  if (!res.ok) {
    // Body can hold provider detail; log a bounded slice, never return it to the client.
    const text = (await res.text().catch(() => '')).slice(0, 500);
    log.warn('upstream_error', { upstream, status: res.status, body: text });
    throw new UpstreamError(`${upstream} returned ${res.status}.`);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch (err) {
    throw new UpstreamError(`${upstream} returned invalid JSON.`, { cause: err });
  }
  if (!schema) return data as T;
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    log.warn('upstream_schema_mismatch', { upstream, issues: parsed.error.issues.slice(0, 5) });
    throw new UpstreamError(`${upstream} returned an unexpected payload.`);
  }
  return parsed.data;
}
