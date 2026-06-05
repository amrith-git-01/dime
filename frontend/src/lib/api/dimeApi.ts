import { create, type AxiosInstance } from "axios";
import * as Device from "expo-device";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase/client";

/**
 * Base URL for FastAPI, from `EXPO_PUBLIC_API_BASE_URL` at **bundle/build time**
 * (Expo inlines `EXPO_PUBLIC_*` when Metro runs or when EAS/prebuild runs).
 *
 * - **Android emulator + `__DEV__`:** `http://` URLs with localhost or a private
 *   LAN host are rewritten to `10.0.2.2` so the emulator can reach the dev PC.
 * - **Physical device or release APK:** no rewrite. The URL in the installed app
 *   is whatever was set when that binary was built — change `.env` / EAS env and
 *   **rebuild** to point at your PC's LAN IP (`http://x.x.x.x:8000`).
 */
function rewriteApiBaseUrlForAndroidEmulator(url: string): string {
  if (
    Platform.OS !== "android" ||
    Device.isDevice ||
    !__DEV__ ||
    !url.startsWith("http://")
  ) {
    return url;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "10.0.2.2" || host === "10.0.3.2") {
      return url;
    }
    const isLocalHost = host === "localhost" || host === "127.0.0.1";
    const isPrivateLan =
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
    if (isLocalHost || isPrivateLan) {
      parsed.hostname = "10.0.2.2";
      return parsed.toString().replace(/\/$/, "");
    }
  } catch {
    /* keep url */
  }
  return url;
}

export function getDimeApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (!raw) {
    return "";
  }
  const trimmed = raw.replace(/\/$/, "");
  return rewriteApiBaseUrlForAndroidEmulator(trimmed);
}

const TOKEN_REFRESH_BUFFER_MS = 60_000;

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

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

/** Drop in-memory token (sign-out or auth errors). */
export function clearDimeAuthTokenCache(): void {
  cachedAccessToken = null;
}

function sessionExpiresAtMs(session: { expires_at?: number | null }): number {
  if (session.expires_at != null) {
    return session.expires_at * 1000;
  }
  return Date.now() + 3_600_000;
}

function cacheSessionAccessToken(session: {
  access_token: string;
  expires_at?: number | null;
}): string {
  cachedAccessToken = {
    value: session.access_token,
    expiresAt: sessionExpiresAtMs(session),
  };
  return cachedAccessToken.value;
}

async function getAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (
    cachedAccessToken &&
    cachedAccessToken.expiresAt - now > TOKEN_REFRESH_BUFFER_MS
  ) {
    return cachedAccessToken.value;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    clearDimeAuthTokenCache();
    return null;
  }
  return cacheSessionAccessToken(session);
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (!session?.access_token) {
    clearDimeAuthTokenCache();
    return;
  }
  cacheSessionAccessToken(session);
});

/** Same bearer token axios uses; needed for `fetch` uploads (RN FormData + axios XHR is unreliable). */
export async function getDimeAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
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

dimeApi.interceptors.request.use(async (config) => {
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
