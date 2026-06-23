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
