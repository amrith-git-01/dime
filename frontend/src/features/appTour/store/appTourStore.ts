import { create } from "zustand";

import {
  endTourPreview,
  startTourPreview,
} from "@/features/tourPreview/store/tourPreviewStore";
import { setTourMasterAt } from "@/lib/onboarding/appTourStorage";
import { subscribeTourEvents } from "@/lib/tour/tourEvents";
import {
  captureTourState,
  restoreTourState,
  type TourStateSnapshot,
} from "@/lib/tour/tourRestoreRegistry";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import { useCelebrationStore } from "@/stores/celebrationStore";

import { getTour, TOUR_ORDER } from "../constants/tourRegistry";
import type { TourId, TourStep } from "../constants/tourTypes";
import {
  pickTourCompletionCelebration,
  type TourCelebration,
} from "../utils/tourCelebrations";
import { popTourScreens, runTourEnterActions } from "../utils/tourNavigation";
import {
  getSeenTourIds,
  haveAllToursBeenSeen,
  isTourSeen,
  markTourSeen,
  pickNextUnseenTour,
} from "../utils/tourSeen";

/** `auto`: first time through (it celebrates). `replay`: seen before, or the first-run tour started again (lighter or no celebration). */
export type AppTourStartedFrom = "auto" | "replay";

/** What a tab tour's finish card shows, and what celebration plays when it appears. */
export type TourCompletion = {
  tourId: TourId;
  /** The first time this tour was seen (not a replay). */
  firstTime: boolean;
  seenCount: number;
  total: number;
  /** This finish made every tour seen. */
  allDone: boolean;
  /** The tour offered as "Up next"; null when everything is seen. */
  nextTourId: TourId | null;
  celebration: TourCelebration;
};

type AppTourState = {
  active: boolean;
  /** Counts the runs started, so the overlay starts fresh for a tour that follows another ("Up next"). */
  runId: number;
  tourId: TourId;
  stepIndex: number;
  /** Who the tour is running for; completion is stored per user. */
  userId: string | undefined;
  startedFrom: AppTourStartedFrom;
  /**
   * The user left the manual add form without saving and the tour is back on the "+" step: its
   * card shows the gentler `retryBody`. Cleared as soon as the tour moves on.
   */
  retry: boolean;
  /** Which way the user last moved (1 forward, -1 back); skipped optional steps keep going that way. */
  direction: 1 | -1;
  /** How many "Do" steps the user has completed in this run: the overlay plays a success effect on each. */
  doneCount: number;
  /**
   * What a tab tour's finish card reports. Worked out once, the first time the run reaches the
   * finish card, and reused if the user goes back and forward again (the tour is seen by then, so
   * working it out again would downgrade the celebration).
   */
  completion: TourCompletion | null;
  /** The finish card's celebration has played in this run (a pause and resume must not play it twice). */
  celebrated: boolean;
  /**
   * A tour was started by the user, so the first-run tour must not start by itself afterwards in
   * this session (it would pop up right after the tour they chose). Survives the end of a tour.
   */
  autoStartSuppressed: boolean;
  markCelebrated: () => void;
  suppressAutoStart: () => void;
  /** Starts a tour at its first step. No-op while one is already running. */
  start: (tourId?: TourId, startedFrom?: AppTourStartedFrom) => void;
  next: () => void;
  back: () => void;
  /** Ends the tour early and remembers it as seen. */
  skip: () => void;
  /** Ends the tour on its last step. */
  finish: () => void;
  /** Moves past a step that cannot be shown (its target or screen never appeared), the way the user was going. */
  skipUnavailable: () => void;
  /**
   * The user did something a tour may be waiting for (see `tourEventNames`). Completes the current
   * step when it is a "Do" step waiting for exactly this event; anything else ignores it.
   */
  onEvent: (name: string) => void;
  /**
   * A transaction was saved from the manual add form. Moves the "add it by hand" step on to the
   * Home recap and asks for the big first-expense celebration (not on a replay). Any other step
   * ignores it.
   */
  onTransactionSaved: () => void;
  /**
   * The manual add form closed without a save. If the tour was waiting on it, goes back one step
   * so the tour never gets stuck.
   */
  onManualAddAbandoned: () => void;
};

const IDLE = {
  active: false,
  tourId: "firstExpense",
  stepIndex: 0,
  retry: false,
  direction: 1,
  doneCount: 0,
  completion: null,
  celebrated: false,
} as const;

function stepOf(tourId: TourId, stepIndex: number): TourStep | undefined {
  return getTour(tourId).steps[stepIndex];
}

/**
 * Remembers a tour as seen. When that makes every tour seen, the "Tour master" time is stored too.
 * Returns what it was before, for the finish card.
 */
function markSeen(
  tourId: TourId,
  userId: string | undefined,
): { wasSeen: boolean; allDone: boolean } {
  const wasSeen = isTourSeen(tourId, userId);
  const wasAllDone = haveAllToursBeenSeen(new Set(getSeenTourIds(userId)));
  markTourSeen(tourId, userId);
  const allDone = haveAllToursBeenSeen(new Set(getSeenTourIds(userId)));
  if (userId !== undefined && allDone) {
    setTourMasterAt(userId);
  }
  return { wasSeen, allDone: allDone && !wasAllDone };
}

/** What the finish card of a tab tour reports: marks the tour seen and works out the celebration. */
function completeTabTour(
  tourId: TourId,
  userId: string | undefined,
  startedFrom: AppTourStartedFrom,
): TourCompletion {
  const { wasSeen, allDone } = markSeen(tourId, userId);
  const seen = new Set(getSeenTourIds(userId));
  const firstTime = !wasSeen;
  return {
    tourId,
    firstTime,
    seenCount: seen.size,
    total: TOUR_ORDER.length,
    allDone: allDone && startedFrom !== "replay",
    nextTourId: pickNextUnseenTour(seen, tourId),
    celebration: pickTourCompletionCelebration({
      replay: startedFrom === "replay",
      firstTime,
      allDone: allDone && startedFrom !== "replay",
      celebratesFirstRun: getTour(tourId).celebratesFirstRun === true,
    }),
  };
}

/** Screen state (calendar month and day...) as it was when the running tour started. */
let capturedScreenState: TourStateSnapshot = new Map();

/** Set by the store below: ends the running tour without marking it seen (an account change). */
let endTourSilently: () => void = () => undefined;

export const useAppTourStore = create<AppTourState>((set, get) => {
  /** Ends the tour: everything back to idle, the app put back as the tour found it. Marks nothing as seen. */
  const end = () => {
    const { tourId } = get();
    const cleanup = getTour(tourId).cleanup;
    set(IDLE);
    useCelebrationStore.getState().setSuppressed(false);
    endTourPreview();
    // Leave the app as the tour found it: no screen the tour pushed (it may show sample data that
    // is gone now), the month and day it changed put back, the agent and the + menu closed.
    popTourScreens(tourId);
    restoreTourState(capturedScreenState);
    capturedScreenState = new Map();
    if (cleanup) {
      runTourEnterActions(cleanup);
    }
  };
  endTourSilently = end;

  /** Moves to a step. Reaching a tab tour's finish card marks the tour seen and prepares its celebration. */
  const moveTo = (stepIndex: number, direction: 1 | -1, extra: Partial<AppTourState> = {}) => {
    const { tourId, userId, startedFrom, completion } = get();
    const step = stepOf(tourId, stepIndex);
    const reachesFinale =
      step?.kind === "finale" && direction === 1 && tourId !== "firstExpense";
    set({
      stepIndex,
      direction,
      retry: false,
      completion:
        completion ?? (reachesFinale ? completeTabTour(tourId, userId, startedFrom) : null),
      ...extra,
    });
  };

  return {
    ...IDLE,
    runId: 0,
    userId: undefined,
    startedFrom: "auto",
    autoStartSuppressed: false,

    markCelebrated: () => set({ celebrated: true }),
    suppressAutoStart: () => set({ autoStartSuppressed: true }),

    start: (tourId = "firstExpense", startedFrom) => {
      if (get().active) {
        return;
      }
      const userId = useAuthSessionStore.getState().userId;
      // Starting a tour that was already seen is a replay (lighter effects, or none for the first-run tour).
      const from: AppTourStartedFrom =
        startedFrom ?? (isTourSeen(tourId, userId) ? "replay" : "auto");
      set({
        ...IDLE,
        active: true,
        runId: get().runId + 1,
        tourId,
        userId,
        startedFrom: from,
      });
      capturedScreenState = captureTourState();
      // A replayed first-run tour celebrates nothing; replayed tab tours only get the lighter effects.
      useCelebrationStore
        .getState()
        .setSuppressed(tourId === "firstExpense" && from === "replay");
      startTourPreview(userId, getTour(tourId).sample ?? []);
    },

    next: () => {
      const { active, tourId, stepIndex } = get();
      if (!active) {
        return;
      }
      if (stepIndex >= getTour(tourId).steps.length - 1) {
        get().finish();
        return;
      }
      moveTo(stepIndex + 1, 1);
    },

    back: () => {
      const { active, stepIndex } = get();
      if (!active || stepIndex <= 0) {
        return;
      }
      moveTo(stepIndex - 1, -1);
    },

    skip: () => {
      const { active, tourId, userId } = get();
      if (!active) {
        return;
      }
      markSeen(tourId, userId);
      end();
    },

    finish: () => {
      const { active, tourId, userId } = get();
      if (!active) {
        return;
      }
      markSeen(tourId, userId);
      end();
    },

    skipUnavailable: () => {
      const { active, tourId, stepIndex, direction } = get();
      if (!active) {
        return;
      }
      const last = getTour(tourId).steps.length - 1;
      if (direction === 1 && stepIndex < last) {
        moveTo(stepIndex + 1, 1);
      } else if (direction === -1 && stepIndex > 0) {
        moveTo(stepIndex - 1, -1);
      }
    },

    onEvent: (name) => {
      const { active, tourId, stepIndex, doneCount } = get();
      if (!active) {
        return;
      }
      const step = stepOf(tourId, stepIndex);
      if (!step || step.kind !== "do" || step.advanceOn !== name) {
        return;
      }
      moveTo(stepIndex + 1, 1, { doneCount: doneCount + 1 });
    },

    onTransactionSaved: () => {
      const { active, tourId, stepIndex, startedFrom } = get();
      if (!active) {
        return;
      }
      const step = stepOf(tourId, stepIndex);
      if (!step || step.advanceOn !== "transactionSaved") {
        return;
      }
      moveTo(stepIndex + 1, 1);
      if (startedFrom !== "replay") {
        useCelebrationStore.getState().celebrate({ kind: "confetti" });
      }
    },

    onManualAddAbandoned: () => {
      const { active, tourId, stepIndex } = get();
      if (!active || stepIndex <= 0) {
        return;
      }
      const step = stepOf(tourId, stepIndex);
      if (!step || step.advanceOn !== "transactionSaved") {
        return;
      }
      moveTo(stepIndex - 1, -1, { retry: true });
    },
  };
});

/** True once the user has finished or skipped the first-expense tour (and for a signed-out user, so it never runs). */
export function isAppTourSeen(userId: string | undefined): boolean {
  return isTourSeen("firstExpense", userId);
}

// What the user does in the app (taps a day, opens a transaction...) reaches the running tour here.
subscribeTourEvents((name) => useAppTourStore.getState().onEvent(name));

// A tour started by one account must not carry over to the next sign-in (or survive sign-out):
// end it silently, without marking anyone as having seen it.
useAuthSessionStore.subscribe((state, prev) => {
  if (state.userId === prev.userId) {
    return;
  }
  // A new account gets its own first run.
  useAppTourStore.setState({ autoStartSuppressed: false });
  if (useAppTourStore.getState().active) {
    // Put the app back as the tour found it (close the agent, the + menu) without marking anyone as seen.
    endTourSilently();
  }
});
