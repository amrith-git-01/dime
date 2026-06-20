import { createMMKV } from "react-native-mmkv";

const settingsMmkv = createMMKV({ id: "dime-settings" });

const KEYS = {
  upiDetection: "capture.upi_enabled",
} as const;

export function getUpiDetectionEnabled(): boolean {
  if (!settingsMmkv.contains(KEYS.upiDetection)) {
    return true;
  }
  return settingsMmkv.getBoolean(KEYS.upiDetection) ?? true;
}

export function setUpiDetectionEnabled(enabled: boolean): void {
  settingsMmkv.set(KEYS.upiDetection, enabled);
}
