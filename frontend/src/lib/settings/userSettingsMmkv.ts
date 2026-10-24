import { createMMKV } from "react-native-mmkv";

import type { CardScreen } from "@/features/cardLayout/cardIds";
import { CARD_SCREENS } from "@/features/cardLayout/cardIds";
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

export type PersistedUserSettings = {
  settings: UserSettings;
  /** When the snapshot was written (ms): the age of the data, for the query cache's staleness. */
  timestamp: number;
};

/**
 * Returns null, and drops the stored snapshot, when it belongs to another user or was written
 * by another schema version.
 */
export function readPersistedUserSettingsSnapshot(
  userId: string | undefined,
): PersistedUserSettings | null {
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
    return {
      settings: normalizeUserSettings(snapshot.settings),
      timestamp: snapshot.timestamp,
    };
  } catch {
    return null;
  }
}

export function readPersistedUserSettings(
  userId: string | undefined,
): UserSettings | null {
  return readPersistedUserSettingsSnapshot(userId)?.settings ?? null;
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

// ─── Card layouts waiting to reach the server ────────────────────────────────────────────────────

export const CARD_LAYOUT_PENDING_MMKV_KEY = "user_settings.card_layouts_pending";

type PendingCardLayouts = { userId: string; screens: CardScreen[] };

function readPendingRecord(): PendingCardLayouts | null {
  const raw = settingsMmkv.getString(CARD_LAYOUT_PENDING_MMKV_KEY);
  if (!raw) {
    return null;
  }
  try {
    const record = JSON.parse(raw) as Partial<PendingCardLayouts>;
    if (typeof record.userId !== "string" || !Array.isArray(record.screens)) {
      return null;
    }
    return {
      userId: record.userId,
      screens: CARD_SCREENS.filter((screen) => record.screens?.includes(screen)),
    };
  } catch {
    return null;
  }
}

function writePendingRecord(userId: string, screens: readonly CardScreen[]): void {
  if (screens.length === 0) {
    settingsMmkv.remove(CARD_LAYOUT_PENDING_MMKV_KEY);
    return;
  }
  const record: PendingCardLayouts = { userId, screens: [...screens] };
  settingsMmkv.set(CARD_LAYOUT_PENDING_MMKV_KEY, JSON.stringify(record));
}

/**
 * Screens whose arranged order is on this device but has not reached the server (the save failed
 * for a reason that will pass: offline, timeout, 5xx, 429). Never returns another user's.
 */
export function readPendingCardLayoutScreens(
  userId: string | undefined,
): CardScreen[] {
  const record = readPendingRecord();
  return userId && record?.userId === userId ? record.screens : [];
}

export function addPendingCardLayoutScreens(
  userId: string,
  screens: readonly CardScreen[],
): void {
  const current = readPendingCardLayoutScreens(userId);
  writePendingRecord(
    userId,
    CARD_SCREENS.filter(
      (screen) => current.includes(screen) || screens.includes(screen),
    ),
  );
}

export function removePendingCardLayoutScreens(
  userId: string,
  screens: readonly CardScreen[],
): void {
  const current = readPendingCardLayoutScreens(userId);
  if (current.length === 0) {
    return;
  }
  writePendingRecord(
    userId,
    current.filter((screen) => !screens.includes(screen)),
  );
}

export function clearPendingCardLayouts(): void {
  settingsMmkv.remove(CARD_LAYOUT_PENDING_MMKV_KEY);
}
