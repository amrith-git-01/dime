import { useCallback } from "react";

import { useCapturePreferencesStore } from "@/stores/capturePreferencesStore";

export function useCapturePreferences() {
  const smsScanEnabled = useCapturePreferencesStore((s) => s.smsScanEnabled);
  const setSmsScanEnabled = useCapturePreferencesStore(
    (s) => s.setSmsScanEnabled,
  );

  const setSmsScan = useCallback(
    (enabled: boolean) => {
      setSmsScanEnabled(enabled);
    },
    [setSmsScanEnabled],
  );

  return {
    smsScanEnabled,
    setSmsScan,
  };
}
