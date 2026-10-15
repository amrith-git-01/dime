import type { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";

import { TOUR_STEP_COUNT } from "@/features/appTour/constants/tourSteps";
import {
  endTourPreview,
  startTourPreviewIfEmpty,
} from "@/features/tourPreview/store/tourPreviewStore";
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
  /**
   * Starts the tour at the first step. No-op while one is already running. For an account the
   * app knows to be empty, the tour also previews sample data (see `features/tourPreview`); the
   * client is only read, to learn whether the account is empty.
   */
  start: (queryClient: QueryClient) => void;
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

  start: (queryClient) => {
    if (get().active) {
      return;
    }
    const userId = useAuthSessionStore.getState().userId;
    set({ active: true, stepIndex: 0, userId });
    startTourPreviewIfEmpty(queryClient, userId);
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
    endTourPreview();
  },

  finish: () => {
    const { active, userId } = get();
    if (!active) {
      return;
    }
    markSeen(userId);
    set({ active: false, stepIndex: 0 });
    endTourPreview();
  },
}));

/** True once the user has finished or skipped the tour (and for a signed-out user, so it never runs). */
export function isAppTourSeen(userId: string | undefined): boolean {
  return userId === undefined || getAppTourCompleted(userId);
}

// A tour started by one account must not carry over to the next sign-in (or survive sign-out):
// end it silently, without marking anyone as having seen it. Sample data goes with it.
useAuthSessionStore.subscribe((state, prev) => {
  if (state.userId === prev.userId) {
    return;
  }
  if (useAppTourStore.getState().active) {
    useAppTourStore.setState({ active: false, stepIndex: 0 });
  }
  endTourPreview();
});
