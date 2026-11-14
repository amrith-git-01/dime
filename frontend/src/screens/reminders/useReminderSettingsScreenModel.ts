import { useCallback } from "react";

import {
  parseUpiId,
  toggleLeadDay,
} from "@/features/reminders/utils/reminderForm";
import { REMINDER_SETTINGS_KEYS } from "@/features/settings/constants/settingsSlices";
import { useSettingsDraft } from "@/features/settings/hooks/useSettingsDraft";
import { useToast } from "@/features/toast/useToast";
import { parseFastApiError } from "@/lib/api/parseFastApiError";

/**
 * Reminder settings (opened from the Reminders list and the Settings hub): when and how early
 * reminders fire, quiet hours, hiding amounts and My UPI ID, saved on their own.
 */
export function useReminderSettingsScreenModel() {
  const { showToast } = useToast();
  const settings = useSettingsDraft(REMINDER_SETTINGS_KEYS);
  const { draft, patchDraft, save } = settings;

  const upiError =
    draft.upiId && !parseUpiId(draft.upiId)
      ? "Enter a UPI ID like name@bank."
      : null;

  const handleSave = useCallback(async () => {
    if (upiError) {
      return;
    }
    try {
      const sent = await save((patch) =>
        patch.upiId === undefined
          ? patch
          : // A cleared field is "no UPI ID" (the API takes an empty string for that).
            { ...patch, upiId: patch.upiId?.trim() || null },
      );
      if (sent) {
        showToast({ variant: "success", message: "Reminder settings saved" });
      }
    } catch (error: unknown) {
      showToast({
        variant: "error",
        message: parseFastApiError(error) || "Could not save reminder settings.",
      });
    }
  }, [save, showToast, upiError]);

  const busy = settings.saving;

  return {
    isInitialLoading: settings.isInitialLoading,
    isError: settings.isError,
    refetch: settings.refetch,
    editorProps: {
      reminders: {
        enabled: draft.remindersEnabled,
        defaultLeadDays: draft.reminderDefaultLeadDays,
        time: draft.reminderTime,
        overdueNudges: draft.reminderOverdueNudges,
        quietEnabled: draft.reminderQuietEnabled,
        quietStart: draft.reminderQuietStart,
        quietEnd: draft.reminderQuietEnd,
        hideAmounts: draft.reminderHideAmounts,
        upiId: draft.upiId ?? "",
        upiError,
        onEnabledChange: (enabled: boolean) =>
          patchDraft({ remindersEnabled: enabled }),
        onDefaultLeadDayToggle: (day: number) =>
          patchDraft((current) => ({
            // Default lead days run 0..27, so the monthly cap fits.
            reminderDefaultLeadDays: toggleLeadDay(
              current.reminderDefaultLeadDays,
              day,
              "monthly",
            ),
          })),
        onTimeChange: (time: string) => patchDraft({ reminderTime: time }),
        onOverdueNudgesChange: (count: number) =>
          patchDraft({ reminderOverdueNudges: count }),
        onQuietEnabledChange: (enabled: boolean) =>
          patchDraft({ reminderQuietEnabled: enabled }),
        onQuietStartChange: (time: string) =>
          patchDraft({ reminderQuietStart: time }),
        onQuietEndChange: (time: string) =>
          patchDraft({ reminderQuietEnd: time }),
        onHideAmountsChange: (hide: boolean) =>
          patchDraft({ reminderHideAmounts: hide }),
        onUpiIdChange: (text: string) =>
          patchDraft({ upiId: text.trim() === "" ? null : text }),
      },
      togglesDisabled: busy,
      saveLoading: busy,
      saveDisabled: !settings.isDirty || busy || upiError !== null,
      clearDisabled: !settings.isDirty || busy,
      onClear: settings.clear,
      onSave: () => void handleSave(),
    },
  };
}
