import { useCallback, useState } from "react";

import { useToast } from "@/features/toast/useToast";
import { performHaptic } from "@/lib/haptics/hapticEngine";
import {
  getCelebrationsEnabled,
  getHapticFeedbackEnabled,
  setCelebrationsEnabled,
  setHapticFeedbackEnabled,
} from "@/lib/haptics/hapticPreferencesStorage";

export function useSettingsHapticScreenModel() {
  const { showToast } = useToast();
  const [saved, setSaved] = useState(getHapticFeedbackEnabled);
  const [draft, setDraft] = useState(saved);
  const [savedCelebrations, setSavedCelebrations] = useState(
    getCelebrationsEnabled,
  );
  const [draftCelebrations, setDraftCelebrations] = useState(savedCelebrations);
  const [saving, setSaving] = useState(false);

  const isDirty = draft !== saved || draftCelebrations !== savedCelebrations;

  const handleClear = useCallback(() => {
    setDraft(saved);
    setDraftCelebrations(savedCelebrations);
  }, [saved, savedCelebrations]);

  const handleSave = useCallback(async () => {
    if (!isDirty) {
      return;
    }

    setSaving(true);
    try {
      setHapticFeedbackEnabled(draft);
      setSaved(draft);
      setCelebrationsEnabled(draftCelebrations);
      setSavedCelebrations(draftCelebrations);
      if (draft) {
        await performHaptic();
      }
      showToast({ variant: "success", message: "Haptic settings saved" });
    } finally {
      setSaving(false);
    }
  }, [draft, draftCelebrations, isDirty, showToast]);

  return {
    editorProps: {
      hapticFeedbackEnabled: draft,
      celebrationsEnabled: draftCelebrations,
      togglesDisabled: saving,
      saveLoading: saving,
      saveDisabled: !isDirty || saving,
      clearDisabled: !isDirty || saving,
      onHapticFeedbackChange: setDraft,
      onCelebrationsChange: setDraftCelebrations,
      onClear: handleClear,
      onSave: () => void handleSave(),
    },
  };
}
