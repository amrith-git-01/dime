import { useCallback, useEffect, useMemo, useState } from "react";

import { getAppPermissionState } from "@/features/onboarding/utils/appPermissions";
import { useUpdateUserSettingsMutation } from "@/features/settings/hooks/useUpdateUserSettingsMutation";
import { useUserSettingsQuery } from "@/features/settings/hooks/useUserSettingsQuery";
import {
  DEFAULT_USER_SETTINGS,
  type ReportRoastLevel,
  type UserSettings,
} from "@/features/settings/types";
import {
  buildSettingsPatch,
  settingsEqual,
} from "@/features/settings/utils/settingsDraft";
import { useToast } from "@/features/toast/useToast";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { syncDailyExpenseReminderSchedule } from "@/lib/notifications/dailyExpenseReminderSchedule";
import { syncExpoPushTokenForUser } from "@/features/settings/utils/syncExpoPushToken";
import {
  parseUpiId,
  toggleLeadDay,
} from "@/features/reminders/utils/reminderForm";

function patchDraft(
  prev: UserSettings | null,
  saved: UserSettings | null,
  update: Partial<UserSettings>,
): UserSettings {
  const base = prev ?? saved ?? DEFAULT_USER_SETTINGS;
  return { ...base, ...update };
}

export function useSettingsNotificationsScreenModel() {
  const { showToast } = useToast();
  const settingsQuery = useUserSettingsQuery();
  const updateMutation = useUpdateUserSettingsMutation();

  const savedSettings = settingsQuery.data ?? null;
  const [draft, setDraft] = useState<UserSettings | null>(null);
  const [draftSyncKey, setDraftSyncKey] = useState(0);

  useEffect(() => {
    if (savedSettings) {
      setDraft(savedSettings);
    }
  }, [savedSettings]);

  const isDirty = useMemo(() => {
    if (!draft || !savedSettings) {
      return false;
    }
    return !settingsEqual(draft, savedSettings);
  }, [draft, savedSettings]);

  const handleClear = useCallback(() => {
    if (savedSettings) {
      setDraft(savedSettings);
      setDraftSyncKey((key) => key + 1);
    }
  }, [savedSettings]);

  const upiError =
    draft?.upiId && !parseUpiId(draft.upiId)
      ? "Enter a UPI ID like name@bank."
      : null;

  const handleSave = useCallback(async () => {
    if (!draft || !savedSettings) {
      return;
    }

    if (upiError) {
      return;
    }
    const patch = buildSettingsPatch(savedSettings, draft);
    if (!patch) {
      return;
    }
    if (patch.upiId !== undefined) {
      // A cleared field is "no UPI ID" (the API takes an empty string for that).
      patch.upiId = patch.upiId?.trim() || null;
    }

    const deviceNotificationsEnabled = draft.deviceNotificationsEnabled;
    const dailyExpenseReminderEnabled = draft.dailyExpenseReminderEnabled;
    const dailyExpenseReminderTime = draft.dailyExpenseReminderTime;

    try {
      await updateMutation.mutateAsync(patch);
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
  }, [draft, savedSettings, showToast, updateMutation, upiError]);

  const isInitialLoading =
    settingsQuery.isPending && settingsQuery.data === undefined;
  const busy = updateMutation.isPending;
  const editorDraft = draft ?? savedSettings ?? DEFAULT_USER_SETTINGS;

  return {
    isInitialLoading,
    isError: settingsQuery.isError,
    refetch: settingsQuery.refetch,
    editorProps: {
      deviceNotificationsEnabled: editorDraft.deviceNotificationsEnabled,
      onDeviceNotificationsChange: (enabled: boolean) => {
        setDraft((prev) =>
          patchDraft(prev, savedSettings, {
            deviceNotificationsEnabled: enabled,
          }),
        );
      },
      dailyExpenseReminderEnabled: editorDraft.dailyExpenseReminderEnabled,
      dailyExpenseReminderTime: editorDraft.dailyExpenseReminderTime,
      onDailyExpenseReminderEnabledChange: (enabled: boolean) => {
        setDraft((prev) =>
          patchDraft(prev, savedSettings, {
            dailyExpenseReminderEnabled: enabled,
          }),
        );
      },
      onDailyExpenseReminderTimeChange: (time: string) => {
        setDraft((prev) =>
          patchDraft(prev, savedSettings, {
            dailyExpenseReminderTime: time,
          }),
        );
      },
      budgetMonthlyAlertsEnabled: editorDraft.budgetMonthlyAlertsEnabled,
      budgetCategoryAlertsEnabled: editorDraft.budgetCategoryAlertsEnabled,
      budgetMonthlyWarnPct: editorDraft.budgetMonthlyWarnPct,
      budgetCategoryWarnPct: editorDraft.budgetCategoryWarnPct,
      autoCaptureAlertsEnabled: editorDraft.autoCaptureAlertsEnabled,
      captureFailedAlertsEnabled: editorDraft.captureFailedAlertsEnabled,
      togglesDisabled: busy,
      saveLoading: busy,
      saveDisabled: !isDirty || busy || upiError !== null,
      clearDisabled: !isDirty || busy,
      onBudgetMonthlyAlertsChange: (enabled: boolean) => {
        setDraft((prev) =>
          patchDraft(prev, savedSettings, {
            budgetMonthlyAlertsEnabled: enabled,
          }),
        );
      },
      onBudgetCategoryAlertsChange: (enabled: boolean) => {
        setDraft((prev) =>
          patchDraft(prev, savedSettings, {
            budgetCategoryAlertsEnabled: enabled,
          }),
        );
      },
      onBudgetMonthlyWarnPctChange: (pct: number) => {
        setDraft((prev) =>
          patchDraft(prev, savedSettings, { budgetMonthlyWarnPct: pct }),
        );
      },
      onBudgetCategoryWarnPctChange: (pct: number) => {
        setDraft((prev) =>
          patchDraft(prev, savedSettings, { budgetCategoryWarnPct: pct }),
        );
      },
      onAutoCaptureAlertsChange: (enabled: boolean) => {
        setDraft((prev) =>
          patchDraft(prev, savedSettings, {
            autoCaptureAlertsEnabled: enabled,
          }),
        );
      },
      onCaptureFailedAlertsChange: (enabled: boolean) => {
        setDraft((prev) =>
          patchDraft(prev, savedSettings, {
            captureFailedAlertsEnabled: enabled,
          }),
        );
      },
      reportAlertsEnabled: editorDraft.reportAlertsEnabled,
      reportRoastLevel: editorDraft.reportRoastLevel,
      onReportAlertsChange: (enabled: boolean) => {
        setDraft((prev) =>
          patchDraft(prev, savedSettings, { reportAlertsEnabled: enabled }),
        );
      },
      onReportRoastLevelChange: (level: ReportRoastLevel) => {
        setDraft((prev) =>
          patchDraft(prev, savedSettings, { reportRoastLevel: level }),
        );
      },
      reminders: {
        enabled: editorDraft.remindersEnabled,
        defaultLeadDays: editorDraft.reminderDefaultLeadDays,
        time: editorDraft.reminderTime,
        overdueNudges: editorDraft.reminderOverdueNudges,
        quietEnabled: editorDraft.reminderQuietEnabled,
        quietStart: editorDraft.reminderQuietStart,
        quietEnd: editorDraft.reminderQuietEnd,
        hideAmounts: editorDraft.reminderHideAmounts,
        upiId: editorDraft.upiId ?? "",
        upiError,
        onEnabledChange: (enabled: boolean) => {
          setDraft((prev) =>
            patchDraft(prev, savedSettings, { remindersEnabled: enabled }),
          );
        },
        onDefaultLeadDayToggle: (day: number) => {
          setDraft((prev) => {
            const base = prev ?? savedSettings ?? DEFAULT_USER_SETTINGS;
            return {
              ...base,
              // Default lead days run 0..27, so the monthly cap fits.
              reminderDefaultLeadDays: toggleLeadDay(
                base.reminderDefaultLeadDays,
                day,
                "monthly",
              ),
            };
          });
        },
        onTimeChange: (time: string) => {
          setDraft((prev) =>
            patchDraft(prev, savedSettings, { reminderTime: time }),
          );
        },
        onOverdueNudgesChange: (count: number) => {
          setDraft((prev) =>
            patchDraft(prev, savedSettings, { reminderOverdueNudges: count }),
          );
        },
        onQuietEnabledChange: (enabled: boolean) => {
          setDraft((prev) =>
            patchDraft(prev, savedSettings, { reminderQuietEnabled: enabled }),
          );
        },
        onQuietStartChange: (time: string) => {
          setDraft((prev) =>
            patchDraft(prev, savedSettings, { reminderQuietStart: time }),
          );
        },
        onQuietEndChange: (time: string) => {
          setDraft((prev) =>
            patchDraft(prev, savedSettings, { reminderQuietEnd: time }),
          );
        },
        onHideAmountsChange: (hide: boolean) => {
          setDraft((prev) =>
            patchDraft(prev, savedSettings, { reminderHideAmounts: hide }),
          );
        },
        onUpiIdChange: (text: string) => {
          setDraft((prev) =>
            patchDraft(prev, savedSettings, {
              upiId: text.trim() === "" ? null : text,
            }),
          );
        },
      },
      onClear: handleClear,
      onSave: () => void handleSave(),
      draftSyncKey,
    },
  };
}
