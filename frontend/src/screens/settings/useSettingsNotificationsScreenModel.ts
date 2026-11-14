import { useCallback } from "react";

import { getAppPermissionState } from "@/features/onboarding/utils/appPermissions";
import { DEVICE_NOTIFICATION_KEYS } from "@/features/settings/constants/settingsSlices";
import { useSettingsDraft } from "@/features/settings/hooks/useSettingsDraft";
import { useToast } from "@/features/toast/useToast";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { syncDailyExpenseReminderSchedule } from "@/lib/notifications/dailyExpenseReminderSchedule";
import { syncExpoPushTokenForUser } from "@/features/settings/utils/syncExpoPushToken";

/**
 * Settings -> Notifications & alerts: device permission, the daily expense reminder and capture
 * alerts, saved together. Budget alerts, reminders and Broke Report settings live next to their
 * features and save on their own.
 */
export function useSettingsNotificationsScreenModel() {
  const { showToast } = useToast();
  const settings = useSettingsDraft(DEVICE_NOTIFICATION_KEYS);
  const { draft, patchDraft, save } = settings;

  const handleSave = useCallback(async () => {
    const deviceNotificationsEnabled = draft.deviceNotificationsEnabled;
    const dailyExpenseReminderEnabled = draft.dailyExpenseReminderEnabled;
    const dailyExpenseReminderTime = draft.dailyExpenseReminderTime;

    try {
      const sent = await save();
      if (!sent) {
        return;
      }
      showToast({ variant: "success", message: "Notification settings saved" });

      try {
        await syncExpoPushTokenForUser(deviceNotificationsEnabled);
      } catch {
        if (deviceNotificationsEnabled) {
          showToast({
            variant: "info",
            message:
              "Device notifications may not work until Android system permission is allowed.",
          });
        }
      }

      try {
        await syncDailyExpenseReminderSchedule({
          enabled: dailyExpenseReminderEnabled,
          time: dailyExpenseReminderTime,
          deviceNotificationsEnabled,
        });

        if (dailyExpenseReminderEnabled && deviceNotificationsEnabled) {
          const permission = await getAppPermissionState("notifications");
          if (!permission.granted) {
            showToast({
              variant: "info",
              message:
                "Daily expense reminder may not work until Android system permission is allowed.",
            });
          }
        }
      } catch {
        if (dailyExpenseReminderEnabled && deviceNotificationsEnabled) {
          showToast({
            variant: "info",
            message:
              "Daily expense reminder may not work until Android system permission is allowed.",
          });
        }
      }
    } catch (error: unknown) {
      showToast({
        variant: "error",
        message:
          parseFastApiError(error) || "Could not save notification settings.",
      });
    }
  }, [draft, save, showToast]);

  const busy = settings.saving;

  return {
    isInitialLoading: settings.isInitialLoading,
    isError: settings.isError,
    refetch: settings.refetch,
    editorProps: {
      deviceNotificationsEnabled: draft.deviceNotificationsEnabled,
      onDeviceNotificationsChange: (enabled: boolean) =>
        patchDraft({ deviceNotificationsEnabled: enabled }),
      dailyExpenseReminderEnabled: draft.dailyExpenseReminderEnabled,
      dailyExpenseReminderTime: draft.dailyExpenseReminderTime,
      onDailyExpenseReminderEnabledChange: (enabled: boolean) =>
        patchDraft({ dailyExpenseReminderEnabled: enabled }),
      onDailyExpenseReminderTimeChange: (time: string) =>
        patchDraft({ dailyExpenseReminderTime: time }),
      autoCaptureAlertsEnabled: draft.autoCaptureAlertsEnabled,
      captureFailedAlertsEnabled: draft.captureFailedAlertsEnabled,
      onAutoCaptureAlertsChange: (enabled: boolean) =>
        patchDraft({ autoCaptureAlertsEnabled: enabled }),
      onCaptureFailedAlertsChange: (enabled: boolean) =>
        patchDraft({ captureFailedAlertsEnabled: enabled }),
      togglesDisabled: busy,
      saveLoading: busy,
      saveDisabled: !settings.isDirty || busy,
      clearDisabled: !settings.isDirty || busy,
      onClear: settings.clear,
      onSave: () => void handleSave(),
    },
  };
}
