import { createMMKV } from "react-native-mmkv";

const settingsMmkv = createMMKV({ id: "dime-settings" });

const KEYS = {
  smsDetection: "capture.sms_enabled",
  upiDetection: "capture.upi_enabled",
} as const;

export function getSmsDetectionEnabled(): boolean {
  if (!settingsMmkv.contains(KEYS.smsDetection)) {
    return true;
  }
  return settingsMmkv.getBoolean(KEYS.smsDetection) ?? true;
}

export function setSmsDetectionEnabled(enabled: boolean): void {
  settingsMmkv.set(KEYS.smsDetection, enabled);
}

export function getUpiDetectionEnabled(): boolean {
  if (!settingsMmkv.contains(KEYS.upiDetection)) {
    return true;
  }
  return settingsMmkv.getBoolean(KEYS.upiDetection) ?? true;
}

export function setUpiDetectionEnabled(enabled: boolean): void {
  settingsMmkv.set(KEYS.upiDetection, enabled);
}
