import { isAxiosError, type AxiosError } from "axios";
import * as Device from "expo-device";

import { getDimeApiBaseUrl } from "./dimeApi";

function isUnreachableNetworkError(error: AxiosError): boolean {
  return (
    error.response == null &&
    (error.code === "ERR_NETWORK" ||
      error.message === "Network Error" ||
      error.message.toLowerCase().includes("network"))
  );
}

/** Best-effort message from FastAPI `HTTPException` / validation error bodies. */
export function parseFastApiError(error: unknown): string {
  if (isAxiosError(error)) {
    if (isUnreachableNetworkError(error)) {
      const base = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? "";
      if (!base) {
        return "API URL missing. Set EXPO_PUBLIC_API_BASE_URL in .env and restart Expo.";
      }
      if (!__DEV__) {
        const apiHost = getDimeApiBaseUrl() || "(not set)";
        return `Cannot reach API at ${apiHost}. The preview APK talks to your laptop over the network — Supabase works in the cloud, but FastAPI runs on your PC. Phone and PC must be on the same Wi‑Fi (not mobile data); open ${apiHost}/docs in the phone browser to test. If that fails, use USB with adb reverse tcp:8000 tcp:8000, or deploy the backend (Railway/Render/Fly) and rebuild with that HTTPS URL.`;
      }
      if (Device.isDevice) {
        return "Cannot reach API. On a real device use your PC's LAN IP in EXPO_PUBLIC_API_BASE_URL (not localhost or 10.0.2.2). Phone and PC must share Wi‑Fi; backend should listen on 0.0.0.0:8000; check the firewall. After changing .env, restart Expo and reload.";
      }
      return "Cannot reach API. On Android emulator, LAN URLs are adjusted automatically in dev. Otherwise use your PC's LAN IP on a real device. Check firewall and that the backend is running.";
    }
    if (error.code === "ECONNABORTED") {
      return "Request timed out. Is the backend running?";
    }
    const data = error.response?.data as
      | { detail?: unknown }
      | string
      | undefined;
    if (typeof data === "string" && data.length > 0) {
      return data;
    }
    if (data && typeof data === "object" && "detail" in data) {
      const detail = data.detail;
      if (typeof detail === "string" && detail.length > 0) {
        return detail;
      }
      if (Array.isArray(detail)) {
        const first = detail[0] as { msg?: unknown } | undefined;
        if (first && typeof first.msg === "string") {
          return first.msg;
        }
      }
    }
    if (error.response?.status === 503) {
      return "Server is not fully configured. Try again later.";
    }
    if (error.response?.status === 401) {
      return "Session expired. Please sign in again.";
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Try again.";
}
