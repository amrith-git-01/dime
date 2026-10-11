import { isAxiosError, type AxiosError } from "axios";
import * as Device from "expo-device";

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
      // Release users only ever see this generic line; the developer hints below are __DEV__-only.
      if (!__DEV__) {
        return "Can't reach Dime right now. Check your internet connection and try again.";
      }
      const base = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? "";
      if (!base) {
        return "API URL missing. Set EXPO_PUBLIC_API_BASE_URL in .env and restart Expo.";
      }
      if (Device.isDevice) {
        return "Cannot reach API. On a real device use your PC's LAN IP (or the deployed Worker URL) in EXPO_PUBLIC_API_BASE_URL, not localhost or 10.0.2.2. Phone and PC must share Wi-Fi; run the backend on 0.0.0.0 (wrangler dev --ip 0.0.0.0); check the firewall. After changing .env, restart Expo and reload.";
      }
      return "Cannot reach API. On the Android emulator, LAN URLs are adjusted automatically in dev. Otherwise use your PC's LAN IP on a real device. Check the firewall and that the backend is running.";
    }
    if (error.code === "ECONNABORTED") {
      return __DEV__
        ? "Request timed out. Is the backend running?"
        : "The request timed out. Please try again.";
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

export function isFastApiNotFound(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}
