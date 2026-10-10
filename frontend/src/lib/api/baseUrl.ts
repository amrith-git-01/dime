import * as Device from "expo-device";
import { Platform } from "react-native";

/**
 * Base URL of the Dime API (Hono Worker), from `EXPO_PUBLIC_API_BASE_URL` at **bundle/build time**
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
