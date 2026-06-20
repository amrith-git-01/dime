import { create } from "zustand";

import {
  getUpiDetectionEnabled,
  setUpiDetectionEnabled as persistUpiEnabled,
} from "@/features/settings/settingsPreferencesStorage";

type CapturePreferencesState = {
  upiEnabled: boolean;
  setUpiEnabled: (enabled: boolean) => void;
};

export const useCapturePreferencesStore = create<CapturePreferencesState>(
  (set) => ({
    upiEnabled: getUpiDetectionEnabled(),
    setUpiEnabled: (enabled) => {
      persistUpiEnabled(enabled);
      set({ upiEnabled: enabled });
    },
  }),
);
