import { createMMKV } from "react-native-mmkv";

/**
 * Device-level widget preferences, kept next to the theme and haptic toggles in `dime-settings`.
 * Survives sign-out. Headless-safe: MMKV only, so the widgets can read it while the app is closed.
 */
const settingsMmkv = createMMKV({ id: "dime-settings" });

const HIDE_AMOUNTS_KEY = "preferences.widget_hide_amounts";

export function getHideWidgetAmounts(): boolean {
  return settingsMmkv.getString(HIDE_AMOUNTS_KEY) === "true";
}

export function setHideWidgetAmounts(hide: boolean): void {
  settingsMmkv.set(HIDE_AMOUNTS_KEY, hide ? "true" : "false");
}
