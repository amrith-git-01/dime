import { useCallback, useState } from "react";

import { useToast } from "@/features/toast/useToast";
import { performHaptic } from "@/lib/haptics/hapticEngine";
import {
  getHapticFeedbackEnabled,
  setHapticFeedbackEnabled,
} from "@/lib/haptics/hapticPreferencesStorage";

export function useSettingsHapticScreenModel() {
  const { showToast } = useToast();
  const [saved, setSaved] = useState(getHapticFeedbackEnabled);
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);

  const isDirty = draft !== saved;

  const handleClear = useCallback(() => {
    setDraft(saved);
  }, [saved]);

  const handleSave = useCallback(async () => {
    if (!isDirty) {
      return;
    }

    setSaving(true);
    try {
      setHapticFeedbackEnabled(draft);
      setSaved(draft);
      if (draft) {
        await performHaptic();
      }
      showToast({ variant: "success", message: "Haptic settings saved" });
    } finally {
      setSaving(false);
    }
  }, [draft, isDirty, showToast]);

  return {
    editorProps: {
      hapticFeedbackEnabled: draft,
      togglesDisabled: saving,
      saveLoading: saving,
      saveDisabled: !isDirty || saving,
      clearDisabled: !isDirty || saving,
      onHapticFeedbackChange: setDraft,
      onClear: handleClear,
      onSave: () => void handleSave(),
    },
  };
}
