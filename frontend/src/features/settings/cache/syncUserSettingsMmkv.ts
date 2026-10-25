import type { QueryClient } from "@tanstack/react-query";

import { readPersistedUserSettingsSnapshot } from "@/lib/settings/userSettingsMmkv";

import { settingsQueryKeys } from "../queryKeys";

/**
 * Seeds the settings query from the device copy so screens render it on the first frame. The data
 * keeps the age it was saved with (`updatedAt`): it is shown at once, but it is not "just fetched",
 * so a mount or focus refetch still pulls what another device changed (e.g. a card layout).
 */
export function hydrateUserSettingsFromMmkv(
  queryClient: QueryClient,
  userId: string | undefined,
): boolean {
  const snapshot = readPersistedUserSettingsSnapshot(userId);
  if (!snapshot || !userId) {
    return false;
  }
  queryClient.setQueryData(settingsQueryKeys.user(userId), snapshot.settings, {
    updatedAt: snapshot.timestamp,
  });
  return true;
}
