import { useCallback, useEffect, useState } from "react";

import { useCapturePreferences } from "@/features/settings/hooks/useCapturePreferences";
import { useToast } from "@/features/toast/useToast";
import { ensureSmsReadPermission } from "@/features/transactions/sms/readInboxSms";

export function useSettingsCaptureScreenModel() {
  const { smsScanEnabled: saved, setSmsScan } = useCapturePreferences();
  const { showToast } = useToast();
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [showOpenSettings, setShowOpenSettings] = useState(false);

  const isDirty = draft !== saved;

  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  useEffect(() => {
    if (!draft) {
      setShowOpenSettings(false);
      return;
    }
    let cancelled = false;
    ensureSmsReadPermission()
      .then((status) => {
        if (!cancelled) {
          setShowOpenSettings(status === "denied");
        }
      })
      .catch(() => {
        // Permission lookup failed; leave the "open settings" hint as it was.
      });
    return () => {
      cancelled = true;
    };
  }, [draft]);

  const handleClear = useCallback(() => {
    setDraft(saved);
  }, [saved]);

  const handleSave = useCallback(async () => {
    if (!isDirty) {
      return;
    }

    setSaving(true);
    try {
      setSmsScan(draft);
      if (draft) {
        const status = await ensureSmsReadPermission();
        setShowOpenSettings(status === "denied");
      } else {
        setShowOpenSettings(false);
      }
      showToast({ variant: "success", message: "Capture settings saved" });
    } finally {
      setSaving(false);
    }
  }, [draft, isDirty, setSmsScan, showToast]);

  return {
    editorProps: {
      smsScanEnabled: draft,
      showOpenSettings,
      togglesDisabled: saving,
      saveLoading: saving,
      saveDisabled: !isDirty || saving,
      clearDisabled: !isDirty || saving,
      onSmsScanChange: setDraft,
      onClear: handleClear,
      onSave: () => {
        void handleSave();
      },
    },
  };
}
