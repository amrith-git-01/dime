import { isAxiosError, type AxiosError } from "axios";

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
      return "Cannot reach API. Use your computer's LAN IP (not localhost) on a real device, or http://10.0.2.2:8000 on Android emulator. Check firewall.";
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
