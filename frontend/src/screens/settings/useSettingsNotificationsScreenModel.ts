import { useCallback, useEffect, useMemo, useState } from "react";

import { useUpdateUserSettingsMutation } from "@/features/settings/hooks/useUpdateUserSettingsMutation";
import { useUserSettingsQuery } from "@/features/settings/hooks/useUserSettingsQuery";
import {
  DEFAULT_USER_SETTINGS,
  type UserSettings,
} from "@/features/settings/types";
import {
  buildSettingsPatch,
  settingsEqual,
} from "@/features/settings/utils/settingsDraft";
import { useToast } from "@/features/toast/useToast";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { syncExpoPushTokenForUser } from "@/features/settings/utils/syncExpoPushToken";

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

  const handleSave = useCallback(async () => {
    if (!draft || !savedSettings) {
      return;
    }

    const patch = buildSettingsPatch(savedSettings, draft);
    if (!patch) {
      return;
    }

    const deviceNotificationsEnabled = draft.deviceNotificationsEnabled;

    try {
      await updateMutation.mutateAsync(patch);
      showToast({ variant: "success", message: "Notification settings saved" });

      try {
        await syncExpoPushTokenForUser(deviceNotificationsEnabled);
      } catch (error: unknown) {
        if (deviceNotificationsEnabled) {
          showToast({
            variant: "info",
            message:
              "Device notifications may not work until Android system permission is allowed.",
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
  }, [
    draft,
    savedSettings,
    showToast,
    syncExpoPushTokenForUser,
    updateMutation,
  ]);

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
      budgetMonthlyAlertsEnabled: editorDraft.budgetMonthlyAlertsEnabled,
      budgetDailyAlertsEnabled: editorDraft.budgetDailyAlertsEnabled,
      budgetCategoryAlertsEnabled: editorDraft.budgetCategoryAlertsEnabled,
      budgetMonthlyWarnPct: editorDraft.budgetMonthlyWarnPct,
      budgetDailyWarnPct: editorDraft.budgetDailyWarnPct,
      budgetCategoryWarnPct: editorDraft.budgetCategoryWarnPct,
      autoCaptureAlertsEnabled: editorDraft.autoCaptureAlertsEnabled,
      captureFailedAlertsEnabled: editorDraft.captureFailedAlertsEnabled,
      togglesDisabled: busy,
      saveLoading: busy,
      saveDisabled: !isDirty || busy,
      clearDisabled: !isDirty || busy,
      onBudgetMonthlyAlertsChange: (enabled: boolean) => {
        setDraft((prev) =>
          patchDraft(prev, savedSettings, {
            budgetMonthlyAlertsEnabled: enabled,
          }),
        );
      },
      onBudgetDailyAlertsChange: (enabled: boolean) => {
        setDraft((prev) =>
          patchDraft(prev, savedSettings, {
            budgetDailyAlertsEnabled: enabled,
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
      onBudgetDailyWarnPctChange: (pct: number) => {
        setDraft((prev) =>
          patchDraft(prev, savedSettings, { budgetDailyWarnPct: pct }),
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
      onClear: handleClear,
      onSave: () => void handleSave(),
      draftSyncKey,
    },
  };
}
