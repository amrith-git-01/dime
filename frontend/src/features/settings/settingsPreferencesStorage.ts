import { createMMKV } from "react-native-mmkv";

const settingsMmkv = createMMKV({ id: "dime-settings" });

const KEYS = {
  smsScan: "capture.sms_scan_enabled",
  upiDetectionLegacy: "capture.upi_enabled",
} as const;

export function getSmsScanEnabled(): boolean {
  if (settingsMmkv.contains(KEYS.smsScan)) {
    return settingsMmkv.getBoolean(KEYS.smsScan) ?? true;
  }
  if (settingsMmkv.contains(KEYS.upiDetectionLegacy)) {
    return settingsMmkv.getBoolean(KEYS.upiDetectionLegacy) ?? true;
  }
  return true;
}

export function setSmsScanEnabled(enabled: boolean): void {
  settingsMmkv.set(KEYS.smsScan, enabled);
}
