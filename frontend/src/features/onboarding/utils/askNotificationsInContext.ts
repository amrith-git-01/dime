import type { QueryClient } from "@tanstack/react-query";

import { settingsQueryKeys } from "@/features/settings/queryKeys";
import type { UserSettings } from "@/features/settings/types";
import {
  PushPermissionDeniedError,
  syncExpoPushTokenForUser,
} from "@/features/settings/utils/syncExpoPushToken";
import {
  hasAskedNotificationsInContext,
  markAskedNotificationsInContext,
} from "@/lib/onboarding/permissionPromptStorage";
import { reportError } from "@/lib/reportError";

import { getAppPermissionStatus, requestAppPermission } from "./appPermissions";
import { confirmReasonAlert } from "./permissionReasonAlert";

/**
 * Asks for notification permission at the moment it helps (a budget or recurring item was just
 * saved), with a one-line reason first. It asks at most once per device, and only while the
 * system dialog has never been answered: never after a grant, a denial, or a previous prompt.
 * Skipped when the user turned Notifications off in Dime's Settings. Registers the push token when
 * the user allows. Never throws; fire and forget it.
 */
export async function askNotificationsInContext(reason: string, queryClient: QueryClient): Promise<void> {
  try {
    if (hasAskedNotificationsInContext() || !inAppNotificationsEnabled(queryClient)) {
      return;
    }
    if ((await getAppPermissionStatus("notifications")) !== "undetermined") {
      return;
    }

    const allowed = await confirmReasonAlert({
      title: "Allow notifications?",
      message: reason,
      confirmLabel: "Allow",
    });
    // Marked once the reason was answered (either way), so an alert the system never showed is asked again later.
    markAskedNotificationsInContext();
    if (!allowed || !(await requestAppPermission("notifications"))) {
      return;
    }
    await syncExpoPushTokenForUser(true, { requestPermission: false });
  } catch (error) {
    if (!(error instanceof PushPermissionDeniedError)) {
      reportError(error, "askNotificationsInContext failed");
    }
  }
}

/** The cached in-app Notifications switch (default on until settings load). */
function inAppNotificationsEnabled(queryClient: QueryClient): boolean {
  const cached = queryClient
    .getQueriesData<UserSettings>({ queryKey: settingsQueryKeys.all })
    .map(([, data]) => data)
    .find((data): data is UserSettings => data !== undefined);
  return cached?.deviceNotificationsEnabled ?? true;
}
