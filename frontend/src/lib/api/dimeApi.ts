import {
  CanceledError,
  create,
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";

import { getDimeApiBaseUrl } from "@/lib/api/baseUrl";
import { etagCache, etagKeyFor } from "@/lib/api/etagCache";
import { getAccessToken, getSession, refreshSession } from "@/lib/auth/session";
import { SessionChangedError } from "@/lib/outbox/failure";
import { currentUserDataEpoch } from "@/lib/userDataEpoch";

export { getDimeApiBaseUrl } from "@/lib/api/baseUrl";

/** Dev-only artificial latency so loading skeletons are visible on device. */
function getDevApiDelayMs(): number {
  if (!__DEV__) {
    return 0;
  }
  const raw = process.env.EXPO_PUBLIC_API_DELAY_MS?.trim();
  if (!raw) {
    return 0;
  }
  const ms = Number.parseInt(raw, 10);
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

function maybeDevApiDelay(): Promise<void> {
  const ms = getDevApiDelayMs();
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Same bearer token axios uses; needed for `fetch` uploads (RN FormData + axios XHR is unreliable). */
export async function getDimeAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

/**
 * Refresh the token (after a 401) and return fresh auth headers; empty when there is no session or
 * the server rejected the refresh token (the session is then really gone). Throws
 * `AuthNetworkError` when the server could not be reached, so callers can report "offline" rather
 * than "session expired". `staleHeaders`: the headers the failed request used, so a token another
 * caller already rotated is reused instead of rotating again.
 */
export async function refreshDimeAuthHeaders(
  staleHeaders?: Record<string, string>,
): Promise<Record<string, string>> {
  const session = await refreshSession({
    staleAccessToken: staleHeaders?.Authorization?.replace(/^Bearer /i, ""),
  });
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export const dimeApi: AxiosInstance = create({
  baseURL: getDimeApiBaseUrl(),
  timeout: 45_000,
  // A 304 is a successful answer to a conditional GET; the response interceptor turns it back into
  // the cached 200 so no caller ever sees it.
  validateStatus: (status) =>
    (status >= 200 && status < 300) || status === 304,
});

if (__DEV__) {
  if (!getDimeApiBaseUrl()) {
    console.warn(
      "[dimeApi] EXPO_PUBLIC_API_BASE_URL is empty — requests will fail.",
    );
  }
  const devApiDelayMs = getDevApiDelayMs();
  if (devApiDelayMs > 0) {
    console.info(
      `[dimeApi] EXPO_PUBLIC_API_DELAY_MS=${devApiDelayMs} — all requests delayed (dev only).`,
    );
  }
}

// Augment axios config with internal fields.
declare module "axios" {
  interface AxiosRequestConfig {
    /**
     * Set by the outbox: this request was made for that user. It is refused (and never refreshed and
     * resent) once the signed-in user is anybody else.
     */
    _outboxUserId?: string;
  }
  interface InternalAxiosRequestConfig {
    _startMs?: number;
    /** Set to true after a 401-triggered token refresh so we don't retry twice. */
    _authRetried?: boolean;
    /** This request carries an `If-None-Match` we added (removed again when its entry is gone). */
    _etagSent?: boolean;
    /** Never send `If-None-Match` for this request (the 304-without-an-entry fallback). */
    _skipEtag?: boolean;
    /** `currentUserDataEpoch()` when the request was built; a GET answered after a wipe is not remembered. */
    _epoch?: number;
  }
}

/**
 * Refresh after a 401. Concurrent callers share one request (`refreshSession` is single-flight).
 * Null when signed out, when the server rejected the refresh token (the session is then cleared
 * and the app drops to the signed-out screen), or when the server is unreachable (session kept).
 */
async function forceRefreshAccessToken(
  staleAccessToken?: string,
): Promise<string | null> {
  try {
    const session = await refreshSession({ staleAccessToken });
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

dimeApi.interceptors.request.use(async (config) => {
  if (__DEV__) {
    config._startMs = Date.now();
  }

  await maybeDevApiDelay();

  assertOutboxUser(config);
  config._epoch = currentUserDataEpoch();

  const auth = await getDimeAuthHeaders();
  // The token fetch may have refreshed across a sign-out / switch.
  assertOutboxUser(config);
  if (auth.Authorization) {
    config.headers.set("Authorization", auth.Authorization);
  }

  // Without an explicit type axios defaults POST bodies to x-www-form-urlencoded, which Android's
  // networking rejects for multipart parts. React Native appends the boundary itself.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    config.headers.set("Content-Type", "multipart/form-data");
  }

  applyConditionalHeader(config);

  return config;
});

function assertOutboxUser(config: InternalAxiosRequestConfig): void {
  if (config._outboxUserId && getSession()?.user.id !== config._outboxUserId) {
    throw new SessionChangedError();
  }
}

/** JSON GETs only; a caller that sets its own `If-None-Match` / `Cache-Control` opts out. */
function isEtagCandidate(config: InternalAxiosRequestConfig): boolean {
  if (config.method?.toLowerCase() !== "get" || config._skipEtag) {
    return false;
  }
  if (config.responseType && config.responseType !== "json") {
    return false;
  }
  return (
    !config.headers.has("If-None-Match") && !config.headers.has("Cache-Control")
  );
}

function readEtag(headers: AxiosResponse["headers"] | undefined): string | null {
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (name.toLowerCase() === "etag" && typeof value === "string" && value) {
      return value;
    }
  }
  return null;
}

/**
 * Sends the validator of the last 200 for this URL. Also runs on the 401 retry (the config is
 * reused): the header is dropped first so a since-evicted entry never leaves a stale one behind.
 */
function applyConditionalHeader(config: InternalAxiosRequestConfig): void {
  if (config._etagSent) {
    config.headers.delete("If-None-Match");
    config._etagSent = false;
  }
  if (!isEtagCandidate(config)) {
    return;
  }
  const entry = etagCache.get(etagKeyFor(config));
  if (entry) {
    config.headers.set("If-None-Match", entry.etag);
    config._etagSent = true;
  }
}

/**
 * Conditional GET bookkeeping on the way back: a 200 with an `ETag` is remembered (one without
 * drops the entry), and a 304 resolves with the remembered body as a plain 200, so the ~20
 * fetchers stay untouched. A 304 whose entry vanished meanwhile (a wipe) is simply re-requested.
 */
function settleConditionalResponse(
  response: AxiosResponse,
): AxiosResponse | Promise<AxiosResponse> {
  const config = response.config;
  if (config.method?.toLowerCase() !== "get") {
    return response;
  }
  const key = etagKeyFor(config);
  // Answered after a wipe: it belongs to the previous account, so nothing of it is remembered.
  const wiped = config._epoch !== undefined && config._epoch !== currentUserDataEpoch();
  if (response.status === 304) {
    if (wiped) {
      // The validator was the old account's; the cache may hold another account's entry by now.
      throw new CanceledError("User data was wiped while the request was in flight.");
    }
    const entry = etagCache.get(key);
    if (entry) {
      return { ...response, status: 200, data: entry.data };
    }
    config._skipEtag = true;
    return dimeApi(config);
  }
  if (config.responseType && config.responseType !== "json") {
    return response;
  }
  if (wiped) {
    return response;
  }
  const etag = readEtag(response.headers);
  if (etag) {
    etagCache.set(key, { etag, data: response.data });
  } else {
    etagCache.delete(key);
  }
  return response;
}

// 401 → refresh token → retry interceptor (always-on, not just dev).
// Handles the race where a stale/expired JWT is sent before the session has a
// chance to proactively refresh it (e.g. token expired while the app was not
// running during a Gradle rebuild, hot-reload gap, or background suspend).
dimeApi.interceptors.response.use(
  (response) => {
    const settled = settleConditionalResponse(response);
    if (__DEV__) {
      const ms = Date.now() - (response.config._startMs ?? Date.now());
      const serverMs = response.headers["x-process-time-ms"];
      const serverSuffix = serverMs ? ` (server: ${serverMs}ms)` : "";
      console.log(
        `[dimeApi] ${response.config.method?.toUpperCase()} ${response.config.url} → ${response.status} in ${ms}ms${serverSuffix}`,
      );
    }
    return settled;
  },
  async (error: AxiosError) => {
    if (__DEV__) {
      const ms = Date.now() - (error.config?._startMs ?? Date.now());
      console.warn(
        `[dimeApi] ${error.config?.method?.toUpperCase()} ${error.config?.url} → ${error.response?.status ?? "ERR"} in ${ms}ms`,
        error.message,
      );
    }

    const config = error.config;
    // Only intercept 401s that haven't already been retried.
    if (error.response?.status !== 401 || !config || config._authRetried) {
      return Promise.reject(error);
    }
    // An outbox request of a user who is no longer signed in must not refresh the new user's
    // session and go out as them.
    if (config._outboxUserId && getSession()?.user.id !== config._outboxUserId) {
      return Promise.reject(error);
    }

    config._authRetried = true;

    const sent = config.headers.get("Authorization");
    const freshToken = await forceRefreshAccessToken(
      typeof sent === "string" ? sent.replace(/^Bearer /i, "") : undefined,
    );
    if (!freshToken) {
      // Refresh failed — propagate original 401 so callers handle sign-out.
      return Promise.reject(error);
    }

    config.headers.set("Authorization", `Bearer ${freshToken}`);
    return dimeApi(config);
  },
);
