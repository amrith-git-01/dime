import { create, type AxiosError, type AxiosInstance } from "axios";

import { getDimeApiBaseUrl } from "@/lib/api/baseUrl";
import { getAccessToken, refreshSession } from "@/lib/auth/session";

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
 * Refresh the token (after a 401) and return fresh auth headers; empty when refresh fails or the
 * server is unreachable. `staleHeaders`: the headers the failed request used, so a token another
 * caller already rotated is reused instead of rotating again.
 */
export async function refreshDimeAuthHeaders(
  staleHeaders?: Record<string, string>,
): Promise<Record<string, string>> {
  const token = await forceRefreshAccessToken(
    staleHeaders?.Authorization?.replace(/^Bearer /i, ""),
  );
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const dimeApi: AxiosInstance = create({
  baseURL: getDimeApiBaseUrl(),
  timeout: 45_000,
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
  interface InternalAxiosRequestConfig {
    _startMs?: number;
    /** Set to true after a 401-triggered token refresh so we don't retry twice. */
    _authRetried?: boolean;
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

  const auth = await getDimeAuthHeaders();
  if (auth.Authorization) {
    config.headers.set("Authorization", auth.Authorization);
  }

  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    config.headers.delete("Content-Type");
  }

  return config;
});

// 401 → refresh token → retry interceptor (always-on, not just dev).
// Handles the race where a stale/expired JWT is sent before the session has a
// chance to proactively refresh it (e.g. token expired while the app was not
// running during a Gradle rebuild, hot-reload gap, or background suspend).
dimeApi.interceptors.response.use(
  (response) => {
    if (__DEV__) {
      const ms = Date.now() - (response.config._startMs ?? Date.now());
      const serverMs = response.headers["x-process-time-ms"];
      const serverSuffix = serverMs ? ` (server: ${serverMs}ms)` : "";
      console.log(
        `[dimeApi] ${response.config.method?.toUpperCase()} ${response.config.url} → ${response.status} in ${ms}ms${serverSuffix}`,
      );
    }
    return response;
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
