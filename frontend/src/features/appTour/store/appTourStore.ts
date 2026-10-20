import { create } from "zustand";

import {
  findTourStepIndex,
  TOUR_STEP_COUNT,
} from "@/features/appTour/constants/tourSteps";
import {
  getAppTourCompleted,
  setAppTourCompleted,
} from "@/lib/onboarding/appTourStorage";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import { useCelebrationStore } from "@/stores/celebrationStore";

/** `auto`: the first-run tour. `replay`: started again from Settings (never celebrates). */
export type AppTourStartedFrom = "auto" | "replay";

type AppTourState = {
  active: boolean;
  stepIndex: number;
  /** Who the tour is running for; completion is stored per user. */
  userId: string | undefined;
  startedFrom: AppTourStartedFrom;
  /**
   * The user left the manual add form without saving and the tour is back on the "+" step: its
   * card shows the gentler `retryBody`. Cleared as soon as the tour moves on.
   */
  retry: boolean;
  /** Starts the tour at the first step. No-op while one is already running. */
  start: (startedFrom?: AppTourStartedFrom) => void;
  next: () => void;
  back: () => void;
  /** Ends the tour early and remembers it as seen. */
  skip: () => void;
  /** Ends the tour on its last step. */
  finish: () => void;
  /**
   * A transaction was saved from the manual add form. Moves the "add it by hand" step on to the
   * Home recap and asks for the big first-expense celebration (not on a replay). Any other step
   * ignores it.
   */
  onTransactionSaved: () => void;
  /**
   * The manual add form closed without a save. If the tour was waiting on it, goes back to the
   * "+" step so the tour never gets stuck.
   */
  onManualAddAbandoned: () => void;
};

const LAST_STEP_INDEX = TOUR_STEP_COUNT - 1;
const FAB_MANUAL_STEP_INDEX = findTourStepIndex("fabManual");
const ADD_FAB_STEP_INDEX = findTourStepIndex("addFab");
const HOME_RECENT_STEP_INDEX = findTourStepIndex("homeRecent");

const IDLE = {
  active: false,
  stepIndex: 0,
  retry: false,
} as const;

function markSeen(userId: string | undefined): void {
  if (userId) {
    setAppTourCompleted(userId);
  }
}

export const useAppTourStore = create<AppTourState>((set, get) => ({
  ...IDLE,
  userId: undefined,
  startedFrom: "auto",

  start: (startedFrom = "auto") => {
    if (get().active) {
      return;
    }
    const userId = useAuthSessionStore.getState().userId;
    set({ active: true, stepIndex: 0, retry: false, userId, startedFrom });
    useCelebrationStore.getState().setSuppressed(startedFrom === "replay");
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
    set({ stepIndex: stepIndex + 1, retry: false });
  },

  back: () => {
    const { active, stepIndex } = get();
    if (!active || stepIndex <= 0) {
      return;
    }
    set({ stepIndex: stepIndex - 1, retry: false });
  },

  skip: () => {
    const { active, userId } = get();
    if (!active) {
      return;
    }
    markSeen(userId);
    set(IDLE);
    useCelebrationStore.getState().setSuppressed(false);
  },

  finish: () => {
    const { active, userId } = get();
    if (!active) {
      return;
    }
    markSeen(userId);
    set(IDLE);
    useCelebrationStore.getState().setSuppressed(false);
  },

  onTransactionSaved: () => {
    const { active, stepIndex, startedFrom } = get();
    if (!active || stepIndex !== FAB_MANUAL_STEP_INDEX) {
      return;
    }
    set({ stepIndex: HOME_RECENT_STEP_INDEX, retry: false });
    if (startedFrom !== "replay") {
      useCelebrationStore.getState().celebrate({ kind: "confetti" });
    }
  },

  onManualAddAbandoned: () => {
    const { active, stepIndex } = get();
    if (!active || stepIndex !== FAB_MANUAL_STEP_INDEX) {
      return;
    }
    set({ stepIndex: ADD_FAB_STEP_INDEX, retry: true });
  },
}));

/** True once the user has finished or skipped the tour (and for a signed-out user, so it never runs). */
export function isAppTourSeen(userId: string | undefined): boolean {
  return userId === undefined || getAppTourCompleted(userId);
}

// A tour started by one account must not carry over to the next sign-in (or survive sign-out):
// end it silently, without marking anyone as having seen it.
useAuthSessionStore.subscribe((state, prev) => {
  if (state.userId === prev.userId) {
    return;
  }
  if (useAppTourStore.getState().active) {
    useAppTourStore.setState(IDLE);
    useCelebrationStore.getState().setSuppressed(false);
  }
});
