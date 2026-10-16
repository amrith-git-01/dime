import { Appearance } from "react-native";
import { createMMKV } from "react-native-mmkv";

import { setApplicationNightMode } from "../../modules/dime-system";

import type { ColorScheme } from "./palettes";

/** What the user picked: follow the OS, or force a scheme. */
export type ThemePreference = "system" | "light" | "dark";

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "system",
  "light",
  "dark",
];

export const THEME_PREFERENCE_LABELS: Readonly<Record<ThemePreference, string>> = {
  system: "System default",
  light: "Light",
  dark: "Dark",
};

/** Device-level preference, kept in the same MMKV file as the haptic toggle. Survives sign-out. */
const settingsMmkv = createMMKV({ id: "dime-settings" });

export const THEME_MODE_KEY = "preferences.theme_mode";

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function getThemePreference(): ThemePreference {
  const stored = settingsMmkv.getString(THEME_MODE_KEY);
  return isThemePreference(stored) ? stored : "system";
}

export function setThemePreference(preference: ThemePreference): void {
  settingsMmkv.set(THEME_MODE_KEY, preference);
}

/** Forced preferences win; "system" follows the OS scheme (light when unknown). */
export function resolveScheme(
  preference: ThemePreference,
  systemScheme: string | null | undefined,
): ColorScheme {
  if (preference === "light" || preference === "dark") {
    return preference;
  }
  return systemScheme === "dark" ? "dark" : "light";
}

/**
 * Makes native chrome (dialogs, pickers, keyboard) follow the choice. `null` hands control back
 * to the OS. Idempotent and synchronous so it can run before the first paint. Also hands the
 * choice to Android (12+), which remembers it across restarts for the system splash screen.
 */
export function applyAppearanceOverride(preference: ThemePreference): void {
  Appearance.setColorScheme(preference === "system" ? null : preference);
  setApplicationNightMode(preference);
}
