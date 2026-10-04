import { createMMKV } from "react-native-mmkv";

import type { UserSettings } from "@/features/settings/types";
import { normalizeUserSettings } from "@/features/settings/types";
import { CACHE_SCHEMA_VERSION } from "@/lib/cacheVersion";
import { APP_QUERY_GC_MS } from "@/lib/queryDefaults";

const settingsMmkv = createMMKV({ id: "dime-settings" });

export const USER_SETTINGS_MMKV_KEY = "user_settings.snapshot";

type UserSettingsSnapshot = {
  version: number;
  /** Owner of the snapshot; it is never read back for another user. */
  userId: string;
  timestamp: number;
  settings: UserSettings;
};

/**
 * Returns null, and drops the stored snapshot, when it belongs to another user or was written
 * by another schema version.
 */
export function readPersistedUserSettings(
  userId: string | undefined,
): UserSettings | null {
  const raw = settingsMmkv.getString(USER_SETTINGS_MMKV_KEY);
  if (!raw || !userId) {
    return null;
  }
  try {
    const snapshot = JSON.parse(raw) as UserSettingsSnapshot;
    if (
      snapshot?.version !== CACHE_SCHEMA_VERSION ||
      snapshot.userId !== userId
    ) {
      settingsMmkv.remove(USER_SETTINGS_MMKV_KEY);
      return null;
    }
    if (!snapshot.timestamp || !snapshot.settings) {
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

export function writePersistedUserSettings(
  userId: string,
  settings: UserSettings,
): void {
  const payload: UserSettingsSnapshot = {
    version: CACHE_SCHEMA_VERSION,
    userId,
    timestamp: Date.now(),
    settings,
  };
  settingsMmkv.set(USER_SETTINGS_MMKV_KEY, JSON.stringify(payload));
}

export function clearPersistedUserSettings(): void {
  settingsMmkv.remove(USER_SETTINGS_MMKV_KEY);
}
