import { createMMKV } from "react-native-mmkv";

const settingsMmkv = createMMKV({ id: "dime-settings" });

const HAPTIC_FEEDBACK_KEY = "preferences.haptic_feedback_enabled";

export function getHapticFeedbackEnabled(): boolean {
  if (!settingsMmkv.contains(HAPTIC_FEEDBACK_KEY)) {
    return true;
  }
  return settingsMmkv.getBoolean(HAPTIC_FEEDBACK_KEY) ?? true;
}

export function setHapticFeedbackEnabled(enabled: boolean): void {
  settingsMmkv.set(HAPTIC_FEEDBACK_KEY, enabled);
}

const CELEBRATIONS_KEY = "preferences.celebrations_enabled";

/** Confetti and bursts when something is finished; on by default. */
export function getCelebrationsEnabled(): boolean {
  if (!settingsMmkv.contains(CELEBRATIONS_KEY)) {
    return true;
  }
  return settingsMmkv.getBoolean(CELEBRATIONS_KEY) ?? true;
}

export function setCelebrationsEnabled(enabled: boolean): void {
  settingsMmkv.set(CELEBRATIONS_KEY, enabled);
}
