import { useCallback } from "react";

import { useCapturePreferencesStore } from "@/stores/capturePreferencesStore";

export function useCapturePreferences() {
  const smsEnabled = useCapturePreferencesStore((s) => s.smsEnabled);
  const upiEnabled = useCapturePreferencesStore((s) => s.upiEnabled);
  const setSmsEnabled = useCapturePreferencesStore((s) => s.setSmsEnabled);
  const setUpiEnabled = useCapturePreferencesStore((s) => s.setUpiEnabled);

  const setSms = useCallback(
    (enabled: boolean) => {
      setSmsEnabled(enabled);
    },
    [setSmsEnabled],
  );

  const setUpi = useCallback(
    (enabled: boolean) => {
      setUpiEnabled(enabled);
    },
    [setUpiEnabled],
  );

  return {
    smsEnabled,
    upiEnabled,
    setSms,
    setUpi,
  };
}
