import { create } from "zustand";

import {
  getWelcomeTourCompleted,
  setWelcomeTourCompleted,
} from "@/lib/onboarding/welcomeTourStorage";

export const useWelcomeTourStore = create<{
  completed: boolean;
  completeWelcomeTour: () => void;
}>((set) => ({
  completed: getWelcomeTourCompleted(),
  completeWelcomeTour: () => {
    setWelcomeTourCompleted();
    set({ completed: true });
  },
}));
