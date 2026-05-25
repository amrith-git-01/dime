import { NativeModules, Platform } from "react-native";

type WatermelonNative = {
  WMDatabaseBridge?: { initializeJSI?: () => void };
  WMDatabaseJSIBridge?: { install?: () => void };
};

/**
 * Probes the same JSI install path WatermelonDB uses internally. When this is
 * false, pass `jsi: false` to SQLiteAdapter so the library does not log the
 * "JSI SQLiteAdapter not available" warning (you are already on the async path).
 *
 * JSI stays unavailable with Chrome remote debugging and until a dev build
 * includes linked native WatermelonDB (`expo run:android` / `expo run:ios`).
 */
export function isWatermelonJsiAvailable(): boolean {
  if (Platform.OS === "web") {
    return false;
  }

  const g = globalThis as typeof globalThis & {
    nativeWatermelonCreateAdapter?: unknown;
  };

  if (typeof g.nativeWatermelonCreateAdapter === "function") {
    return true;
  }

  const { WMDatabaseBridge, WMDatabaseJSIBridge } =
    NativeModules as WatermelonNative;

  if (WMDatabaseBridge?.initializeJSI) {
    try {
      WMDatabaseBridge.initializeJSI();
      return typeof g.nativeWatermelonCreateAdapter === "function";
    } catch {
      return false;
    }
  }

  if (WMDatabaseJSIBridge?.install) {
    try {
      WMDatabaseJSIBridge.install();
      return typeof g.nativeWatermelonCreateAdapter === "function";
    } catch {
      return false;
    }
  }

  return false;
}
