import { useCallback } from "react";

import { useCapturePreferencesStore } from "@/stores/capturePreferencesStore";

export function useCapturePreferences() {
  const upiEnabled = useCapturePreferencesStore((s) => s.upiEnabled);
  const setUpiEnabled = useCapturePreferencesStore((s) => s.setUpiEnabled);

  const setUpi = useCallback(
    (enabled: boolean) => {
      setUpiEnabled(enabled);
    },
    [setUpiEnabled],
  );

  return {
    upiEnabled,
    setUpi,
  };
}
