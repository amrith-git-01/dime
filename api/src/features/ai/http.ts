import { fetchWithRetry } from '../../core/http';
import type { FetchOptions } from '../../core/http';
import { log } from '../../core/logging';
import { PermanentAiError, TransientAiError } from './errors';

const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([408, 425, 429]);

/**
 * The error for a non-2xx provider response: transient (408/425/429/5xx) or permanent. The provider's body is
 * logged (bounded) and never put in the message (S9). Shared with the agent's streaming client.
 */
export async function upstreamStatusError(upstream: string, res: Response): Promise<TransientAiError | PermanentAiError> {
  const text = (await res.text().catch(() => '')).slice(0, 500);
  log.warn('ai_upstream_error', { upstream, status: res.status, body: text });
  const transient = TRANSIENT_STATUSES.has(res.status) || res.status >= 500;
  return transient ? new TransientAiError(`${upstream} returned ${res.status}.`) : new PermanentAiError(`${upstream} returned ${res.status}.`);
}

/**
 * One AI provider call with no in-handler retries (the queue retries the whole job with backoff).
 * Network errors, timeouts, 408/425/429 and 5xx are transient; any other non-2xx is permanent. The
 * provider's error body is logged (bounded) and never put in an error message (S9).
 */
export async function aiPost(
  url: string,
  options: Pick<FetchOptions, 'headers' | 'json' | 'body' | 'timeoutMs'> & { upstream: string },
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchWithRetry(url, { ...options, method: 'POST', retries: 0, retryOnStatus: [] });
  } catch (err) {
    throw new TransientAiError(`${options.upstream} request failed.`, { cause: err });
  }
  if (!res.ok) throw await upstreamStatusError(options.upstream, res);
  try {
    return await res.json();
  } catch (err) {
    throw new PermanentAiError(`${options.upstream} returned invalid JSON.`, { cause: err });
  }
}

/** Collapse a list of attempt failures: transient if any attempt could succeed later. */
export function aggregateFailure(message: string, errors: readonly unknown[]): TransientAiError | PermanentAiError {
  const transient = errors.some((e) => e instanceof TransientAiError);
  const last = errors.at(-1);
  return transient ? new TransientAiError(message, { cause: last }) : new PermanentAiError(message, { cause: last });
}
