import { useCallback, useState } from "react";

import {
  getSmsDetectionEnabled,
  getUpiDetectionEnabled,
  setSmsDetectionEnabled,
  setUpiDetectionEnabled,
} from "../settingsPreferencesStorage";

export function useCapturePreferences() {
  const [smsEnabled, setSmsEnabled] = useState(getSmsDetectionEnabled);
  const [upiEnabled, setUpiEnabled] = useState(getUpiDetectionEnabled);

  const setSms = useCallback((enabled: boolean) => {
    setSmsDetectionEnabled(enabled);
    setSmsEnabled(enabled);
  }, []);

  const setUpi = useCallback((enabled: boolean) => {
    setUpiDetectionEnabled(enabled);
    setUpiEnabled(enabled);
  }, []);

  return {
    smsEnabled,
    upiEnabled,
    setSms,
    setUpi,
  };
}
