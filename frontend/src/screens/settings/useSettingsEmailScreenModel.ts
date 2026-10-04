import { useCallback, useEffect, useMemo, useState } from "react";

import { useUpdateUserSettingsMutation } from "@/features/settings/hooks/useUpdateUserSettingsMutation";
import { useUserSettingsQuery } from "@/features/settings/hooks/useUserSettingsQuery";
import { DEFAULT_USER_SETTINGS } from "@/features/settings/types";
import { useToast } from "@/features/toast/useToast";
import { parseFastApiError } from "@/lib/api/parseFastApiError";

export function useSettingsEmailScreenModel() {
  const { showToast } = useToast();
  const settingsQuery = useUserSettingsQuery();
  const updateMutation = useUpdateUserSettingsMutation();
  const saved = settingsQuery.data ?? DEFAULT_USER_SETTINGS;

  const [weekly, setWeekly] = useState(saved.weeklyEmailEnabled);
  const [monthly, setMonthly] = useState(saved.monthlyEmailEnabled);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setWeekly(saved.weeklyEmailEnabled);
    setMonthly(saved.monthlyEmailEnabled);
  }, [saved.monthlyEmailEnabled, saved.weeklyEmailEnabled]);

  const isDirty = useMemo(
    () =>
      weekly !== saved.weeklyEmailEnabled ||
      monthly !== saved.monthlyEmailEnabled,
    [monthly, saved.monthlyEmailEnabled, saved.weeklyEmailEnabled, weekly],
  );

  const handleClear = useCallback(() => {
    setWeekly(saved.weeklyEmailEnabled);
    setMonthly(saved.monthlyEmailEnabled);
  }, [saved.monthlyEmailEnabled, saved.weeklyEmailEnabled]);

  const handleSave = useCallback(async () => {
    if (!isDirty) {
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        weeklyEmailEnabled: weekly,
        monthlyEmailEnabled: monthly,
      });
      showToast({ variant: "success", message: "Email settings saved" });
    } catch (error) {
      showToast({
        variant: "error",
        message: parseFastApiError(error) || "Could not save email settings.",
      });
    } finally {
      setSaving(false);
    }
  }, [isDirty, monthly, showToast, updateMutation, weekly]);

  return {
    editorProps: {
      weeklyEmailEnabled: weekly,
      monthlyEmailEnabled: monthly,
      togglesDisabled: saving,
      saveLoading: saving,
      saveDisabled: !isDirty || saving,
      clearDisabled: !isDirty || saving,
      onWeeklyEmailChange: setWeekly,
      onMonthlyEmailChange: setMonthly,
      onClear: handleClear,
      onSave: () => {
        void handleSave();
      },
    },
  };
}
