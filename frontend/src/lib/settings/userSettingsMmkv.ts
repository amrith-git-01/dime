import { createMMKV } from "react-native-mmkv";

import type { UserSettings } from "@/features/settings/types";
import { normalizeUserSettings } from "@/features/settings/types";
import { APP_QUERY_GC_MS } from "@/lib/queryDefaults";

const settingsMmkv = createMMKV({ id: "dime-settings" });

export const USER_SETTINGS_MMKV_KEY = "user_settings.snapshot";

type UserSettingsSnapshot = {
  timestamp: number;
  settings: UserSettings;
};

export function readPersistedUserSettings(): UserSettings | null {
  const raw = settingsMmkv.getString(USER_SETTINGS_MMKV_KEY);
  if (!raw) {
    return null;
  }
  try {
    const snapshot = JSON.parse(raw) as UserSettingsSnapshot;
    if (!snapshot?.timestamp || !snapshot.settings) {
      return null;
    }
    if (Date.now() - snapshot.timestamp > APP_QUERY_GC_MS) {
      settingsMmkv.remove(USER_SETTINGS_MMKV_KEY);
      return null;
    }
    return normalizeUserSettings(snapshot.settings);
  } catch {
    return null;
  }
}

export function writePersistedUserSettings(settings: UserSettings): void {
  const payload: UserSettingsSnapshot = {
    timestamp: Date.now(),
    settings,
  };
  settingsMmkv.set(USER_SETTINGS_MMKV_KEY, JSON.stringify(payload));
}

export function clearPersistedUserSettings(): void {
  settingsMmkv.remove(USER_SETTINGS_MMKV_KEY);
}
