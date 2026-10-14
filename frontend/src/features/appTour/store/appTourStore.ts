import { create } from "zustand";

import { TOUR_STEP_COUNT } from "@/features/appTour/constants/tourSteps";
import {
  getAppTourCompleted,
  setAppTourCompleted,
} from "@/lib/onboarding/appTourStorage";
import { useAuthSessionStore } from "@/stores/authSessionStore";

type AppTourState = {
  active: boolean;
  stepIndex: number;
  /** Who the tour is running for; completion is stored per user. */
  userId: string | undefined;
  /** Starts the tour at the first step. No-op while one is already running. */
  start: () => void;
  next: () => void;
  back: () => void;
  /** Ends the tour early and remembers it as seen. */
  skip: () => void;
  /** Ends the tour on its last step. */
  finish: () => void;
};

const LAST_STEP_INDEX = TOUR_STEP_COUNT - 1;

function markSeen(userId: string | undefined): void {
  if (userId) {
    setAppTourCompleted(userId);
  }
}

export const useAppTourStore = create<AppTourState>((set, get) => ({
  active: false,
  stepIndex: 0,
  userId: undefined,

  start: () => {
    if (get().active) {
      return;
    }
    set({
      active: true,
      stepIndex: 0,
      userId: useAuthSessionStore.getState().userId,
    });
  },

  next: () => {
    const { active, stepIndex } = get();
    if (!active) {
      return;
    }
    if (stepIndex >= LAST_STEP_INDEX) {
      get().finish();
      return;
    }
    set({ stepIndex: stepIndex + 1 });
  },

  back: () => {
    const { active, stepIndex } = get();
    if (!active || stepIndex <= 0) {
      return;
    }
    set({ stepIndex: stepIndex - 1 });
  },

  skip: () => {
    const { active, userId } = get();
    if (!active) {
      return;
    }
    markSeen(userId);
    set({ active: false, stepIndex: 0 });
  },

  finish: () => {
    const { active, userId } = get();
    if (!active) {
      return;
    }
    markSeen(userId);
    set({ active: false, stepIndex: 0 });
  },
}));

/** True once the user has finished or skipped the tour (and for a signed-out user, so it never runs). */
export function isAppTourSeen(userId: string | undefined): boolean {
  return userId === undefined || getAppTourCompleted(userId);
}
