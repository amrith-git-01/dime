import { getDimeApiBaseUrl } from "@/lib/api/baseUrl";

import {
  clearStoredAuthSession,
  readStoredAuthSession,
  writeStoredAuthSession,
} from "./authStorage";
import type { AuthSession } from "./types";

/** Refresh when the access token has less than this left. */
const REFRESH_BUFFER_MS = 60_000;
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * The server could not be reached, or answered with an error that says nothing about the session
 * (5xx, 429, timeout). The stored session is kept; the caller should retry later.
 */
export class AuthNetworkError extends Error {
  override name = "AuthNetworkError";
}

/** The server rejected a sign-in attempt (bad or expired Google token, unconfigured server). */
export class AuthRejectedError extends Error {
  override name = "AuthRejectedError";
}

type Listener = (session: AuthSession | null) => void;

let current: AuthSession | null = readStoredAuthSession();
const listeners = new Set<Listener>();
let inflightRefresh: Promise<AuthSession | null> | null = null;

/** The current session, from memory (loaded from the encrypted store at launch). */
export function getSession(): AuthSession | null {
  return current;
}

/** Called with the new session (or null) after every sign-in, token refresh and sign-out. Returns unsubscribe. */
export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Persist first, then expose: a crash between the two can never leave a rotated-away refresh token on disk. */
function commit(session: AuthSession | null): void {
  if (session) {
    writeStoredAuthSession(session);
  } else {
    clearStoredAuthSession();
  }
  current = session;
  for (const listener of [...listeners]) {
    listener(session);
  }
}

/** Forget the session on this device (sign-out, or the server revoked it). */
export function clearSession(): void {
  if (current || readStoredAuthSession()) {
    commit(null);
  }
}

type PostResult = { status: number; body: unknown };

async function postJson(
  path: string,
  body: unknown,
  accessToken?: string,
): Promise<PostResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${getDimeApiBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      // 204 or a non-JSON error page
    }
    return { status: response.status, body: parsed };
  } catch {
    throw new AuthNetworkError("Can't reach the server. Check your connection.");
  } finally {
    clearTimeout(timer);
  }
}

function isSessionBody(value: unknown): value is AuthSession {
  const s = value as Partial<AuthSession> | null;
  return (
    !!s &&
    typeof s.access_token === "string" &&
    typeof s.refresh_token === "string" &&
    typeof s.expires_at === "number" &&
    typeof s.user?.id === "string"
  );
}

function detailOf(body: unknown): string | null {
  const detail = (body as { detail?: unknown } | null)?.detail;
  return typeof detail === "string" && detail.length > 0 ? detail : null;
}

/** Exchange a Google ID token for a Dime session and store it. */
export async function signInWithGoogleIdToken(
  idToken: string,
): Promise<AuthSession> {
  const { status, body } = await postJson("/api/v1/auth/google", {
    id_token: idToken,
  });
  if (status >= 500 || status === 429) {
    throw new AuthNetworkError("Sign-in is unavailable right now. Try again.");
  }
  if (status !== 200 || !isSessionBody(body)) {
    throw new AuthRejectedError(
      detailOf(body) ?? "Couldn't sign in with Google. Try again.",
    );
  }
  commit(body);
  return body;
}

async function runRefresh(snapshot: AuthSession): Promise<AuthSession | null> {
  // The refresh token is single use: this is the only request that may carry it.
  const { status, body } = await postJson("/api/v1/auth/refresh", {
    refresh_token: snapshot.refresh_token,
  });

  // The user signed out (or in again) while the request was in flight: drop its result.
  const superseded = current?.refresh_token !== snapshot.refresh_token;

  if (status === 200 && isSessionBody(body)) {
    if (superseded) {
      return current;
    }
    commit(body);
    return body;
  }
  if (status === 401) {
    if (!superseded) {
      commit(null);
    }
    return current;
  }
  // 5xx, 429, a malformed body: the session may be fine. Keep it and let the caller retry.
  throw new AuthNetworkError("Couldn't refresh the session. Try again later.");
}

/**
 * Rotate the token pair. One request at a time: concurrent callers share the same promise, so the
 * same refresh token is never sent twice (the server revokes a token family on reuse).
 *
 * Resolves with the new session; null when there is none (signed out, or the server rejected the
 * refresh token with 401, in which case the session is cleared). Rejects with `AuthNetworkError`
 * when the server could not be reached, keeping the session.
 *
 * `staleAccessToken`: the token a request just failed with. If the session already holds a newer
 * one (another caller refreshed meanwhile), that one is returned without a new rotation.
 */
export function refreshSession(options?: {
  staleAccessToken?: string | undefined;
}): Promise<AuthSession | null> {
  if (inflightRefresh) {
    return inflightRefresh;
  }
  const snapshot = current;
  if (!snapshot) {
    return Promise.resolve(null);
  }
  if (
    options?.staleAccessToken &&
    snapshot.access_token !== options.staleAccessToken
  ) {
    return Promise.resolve(snapshot);
  }
  const promise = runRefresh(snapshot).finally(() => {
    inflightRefresh = null;
  });
  inflightRefresh = promise;
  return promise;
}

/**
 * A usable access token, refreshing first when it expires within a minute. Null when signed out.
 * If the refresh cannot reach the server, a token that has not actually expired yet is still
 * returned; otherwise `AuthNetworkError` is thrown.
 */
export async function getAccessToken(): Promise<string | null> {
  const session = current;
  if (!session) {
    return null;
  }
  if (session.expires_at * 1000 - Date.now() > REFRESH_BUFFER_MS) {
    return session.access_token;
  }
  try {
    return (await refreshSession())?.access_token ?? null;
  } catch (error) {
    if (
      error instanceof AuthNetworkError &&
      session.expires_at * 1000 > Date.now()
    ) {
      return session.access_token;
    }
    throw error;
  }
}

/**
 * Tell the server to revoke the session (`global` = every device). Rejects when the server could
 * not be reached or refused; the caller still clears the local session.
 */
export async function signOutRemote(scope: "global" | "local"): Promise<void> {
  const session = current;
  if (!session) {
    return;
  }
  const token = await getAccessToken().catch(() => session.access_token);
  const { status } = await postJson(
    "/api/v1/auth/sign-out",
    { scope, refresh_token: session.refresh_token },
    token ?? session.access_token,
  );
  // 401: the session was already revoked or expired, which is what sign-out wants.
  if (status >= 400 && status !== 401) {
    throw new AuthNetworkError("Sign-out request failed.");
  }
}
