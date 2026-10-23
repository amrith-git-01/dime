import { isAxiosError } from "axios";

import { parseFastApiError } from "@/lib/api/parseFastApiError";

/**
 * A failed receipt / voice / manual submit with what the outbox needs to decide what to do next:
 * the HTTP status (absent when the server was never reached) and the `Retry-After` of a 429.
 */
export class SubmitError extends Error {
  override name = "SubmitError";
  readonly status: number | undefined;
  /** The server could not be reached: offline, DNS, connection reset, or the request timed out. */
  readonly networkFailure: boolean;
  readonly retryAfterSeconds: number | undefined;
  /** The API's machine-readable error `code` (`captured_at_future`), when it sent one. */
  readonly code: string | undefined;

  constructor(
    message: string,
    options: {
      status?: number;
      networkFailure?: boolean;
      retryAfterSeconds?: number;
      code?: string;
    } = {},
  ) {
    super(message);
    this.code = options.code;
    this.status = options.status;
    this.networkFailure = options.networkFailure ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/** The signed-in user is no longer the one an outbox request was made for: it must not be sent (or refreshed and resent) as someone else. */
export class SessionChangedError extends Error {
  override name = "SessionChangedError";
  constructor() {
    super("The signed-in account changed.");
  }
}

/** Shown for a 401 that survived the token refresh: only the user can fix it. */
export const SIGN_IN_AGAIN_MESSAGE = "Sign in again to sync";

/**
 * - `retry`: try again later with the same idempotency key (offline, timeout, 5xx, 408, 409
 *   "still processing", a plain rate limit, an expired session being refreshed).
 * - `limit`: the per-user daily capture cap (429 "…Try again tomorrow."); retry after it resets.
 * - `fatal`: the server refused it (other 4xx) or something local is wrong; the user decides.
 */
export type FailureKind = "retry" | "limit" | "fatal";

export type Failure = {
  kind: FailureKind;
  message: string;
  /** The server could not be reached at all (as opposed to answering with an error). */
  offline?: boolean;
  /** Seconds the server asked to wait (`Retry-After`); the daily limit sends the time to 00:00 UTC. */
  retryAfterSeconds?: number;
};

/** The daily-cap detail the ingest routes send: "You've used today's 10 receipt scans. Try again tomorrow." / "Scanning is paused for today. Try again tomorrow." */
const DAILY_LIMIT_DETAIL = /try again tomorrow\.?\s*$/i;

function isNetworkLike(error: Error): boolean {
  return (
    error.name === "AuthNetworkError" ||
    error.name === "AbortError" ||
    (error instanceof TypeError && /network request failed|failed to fetch/i.test(error.message))
  );
}

function classifyStatus(
  status: number,
  message: string,
  retryAfterSeconds: number | undefined,
): Failure {
  const retryAfter = retryAfterSeconds === undefined ? {} : { retryAfterSeconds };
  if (status === 429) {
    return DAILY_LIMIT_DETAIL.test(message)
      ? { kind: "limit", message, ...retryAfter }
      : { kind: "retry", message, ...retryAfter };
  }
  // The interceptor already refreshed the token once: a 401 here will not fix itself.
  if (status === 401) {
    return { kind: "fatal", message: SIGN_IN_AGAIN_MESSAGE };
  }
  if (status >= 500 || status === 408 || status === 409) {
    return { kind: "retry", message, ...retryAfter };
  }
  return { kind: "fatal", message };
}

/** Sorts any error thrown by the submit helpers (axios, `SubmitError`, `AuthNetworkError`) into what to do next. */
export function classifyFailure(error: unknown): Failure {
  if (error instanceof SubmitError) {
    if (error.networkFailure) {
      return { kind: "retry", message: error.message, offline: true };
    }
    if (error.status !== undefined) {
      return classifyStatus(error.status, error.message, error.retryAfterSeconds);
    }
    return { kind: "fatal", message: error.message };
  }
  if (isAxiosError(error)) {
    const message = parseFastApiError(error);
    if (!error.response) {
      // No answer at all: ERR_NETWORK, ECONNABORTED / ETIMEDOUT (timeout) or a dropped connection.
      return { kind: "retry", message, offline: true };
    }
    const header = error.response.headers?.["retry-after"] as unknown;
    const seconds = Number(header);
    return classifyStatus(
      error.response.status,
      message,
      Number.isFinite(seconds) && seconds > 0 ? seconds : undefined,
    );
  }
  if (error instanceof SessionChangedError) {
    return { kind: "retry", message: error.message };
  }
  if (error instanceof Error) {
    return isNetworkLike(error)
      ? { kind: "retry", message: error.message, offline: true }
      : { kind: "fatal", message: error.message };
  }
  return { kind: "fatal", message: "Something went wrong. Try again." };
}
