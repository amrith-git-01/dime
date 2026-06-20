import { create } from "zustand";

import {
  getSmsDetectionEnabled,
  getUpiDetectionEnabled,
  setSmsDetectionEnabled as persistSmsEnabled,
  setUpiDetectionEnabled as persistUpiEnabled,
} from "@/features/settings/settingsPreferencesStorage";

type CapturePreferencesState = {
  smsEnabled: boolean;
  upiEnabled: boolean;
  setSmsEnabled: (enabled: boolean) => void;
  setUpiEnabled: (enabled: boolean) => void;
};

export const useCapturePreferencesStore = create<CapturePreferencesState>(
  (set) => ({
    smsEnabled: getSmsDetectionEnabled(),
    upiEnabled: getUpiDetectionEnabled(),
    setSmsEnabled: (enabled) => {
      persistSmsEnabled(enabled);
      set({ smsEnabled: enabled });
    },
    setUpiEnabled: (enabled) => {
      persistUpiEnabled(enabled);
      set({ upiEnabled: enabled });
    },
  }),
);
