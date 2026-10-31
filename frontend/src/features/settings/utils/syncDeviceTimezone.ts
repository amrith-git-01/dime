import type { QueryClient } from "@tanstack/react-query";

import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import { patchUserSettings } from "../api/settingsApi";
import { settingsQueryKeys } from "../queryKeys";
import type { UserSettings } from "../types";

/** The last timezone tried per user in this session: a failed save is not retried on every launch step. */
const attempted = new Map<string, string>();

/**
 * Tells the server which timezone this device is in (reminders fire in the user's own clock), only
 * when it differs from what the server has. Fire and forget: it never throws and never blocks
 * startup; a failure is simply tried again next launch.
 */
export async function syncDeviceTimezone(
  queryClient: QueryClient,
  userId: string,
  settings: Pick<UserSettings, "timezone">,
): Promise<void> {
  try {
    const timezone = getDeviceIanaTimezone();
    if (!timezone || timezone === settings.timezone || attempted.get(userId) === timezone) {
      return;
    }
    attempted.set(userId, timezone);
    await patchUserSettings({ timezone });
    queryClient.setQueryData<UserSettings>(settingsQueryKeys.user(userId), (previous) =>
      previous ? { ...previous, timezone } : previous,
    );
  } catch {
    // Not worth a message: nothing breaks, reminders keep using the timezone they were made in.
  }
}

/** Test hook: forgets what was tried. */
export function resetDeviceTimezoneAttempts(): void {
  attempted.clear();
}
