import { create } from "zustand";

import {
  getSmsScanEnabled,
  setSmsScanEnabled as persistSmsScanEnabled,
} from "@/features/settings/settingsPreferencesStorage";

type CapturePreferencesState = {
  smsScanEnabled: boolean;
  setSmsScanEnabled: (enabled: boolean) => void;
};

export const useCapturePreferencesStore = create<CapturePreferencesState>(
  (set) => ({
    smsScanEnabled: getSmsScanEnabled(),
    setSmsScanEnabled: (enabled) => {
      persistSmsScanEnabled(enabled);
      set({ smsScanEnabled: enabled });
    },
  }),
);
