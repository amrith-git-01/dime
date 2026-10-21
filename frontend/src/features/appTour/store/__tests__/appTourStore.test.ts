import { createMMKV } from "react-native-mmkv";

import { useTourPreviewStore } from "@/features/tourPreview";
import { emitTourEvent } from "@/lib/tour/tourEvents";
import { resetMockMmkv } from "@/test-utils/mockMmkv";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";
import { useAgentChatUiStore } from "@/stores/agentChatUiStore";
import { useCelebrationStore } from "@/stores/celebrationStore";

import {
  findTourStepIndex,
  getTour,
  TOUR_ORDER,
} from "../../constants/tourRegistry";
import type { TourId } from "../../constants/tourTypes";
import { isTourSeen, markTourSeen } from "../../utils/tourSeen";
import { isAppTourSeen, useAppTourStore } from "../appTourStore";

jest.mock("react-native-mmkv", () =>
  jest.requireActual("@/test-utils/mockMmkv"),
);
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerConfirmHaptic: jest.fn(() => Promise.resolve()),
  triggerTickHaptic: jest.fn(() => Promise.resolve()),
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));

let mockUserId: string | undefined = "user-a";
type AuthListener = (state: { userId?: string }, prev: { userId?: string }) => void;
// On globalThis: jest.mock is hoisted above this file's declarations, and the store module
// subscribes while it is first imported.
const authListeners = (): AuthListener[] => {
  const holder = globalThis as { mockAuthListeners?: AuthListener[] };
  holder.mockAuthListeners ??= [];
  return holder.mockAuthListeners;
};
jest.mock("@/stores/authSessionStore", () => ({
  useAuthSessionStore: {
    getState: () => ({ userId: mockUserId }),
    subscribe: (listener: AuthListener) => {
      authListeners().push(listener);
      return () => undefined;
    },
  },
}));

/** Simulates a sign-in / sign-out / account switch in the auth store. */
function switchUser(next: string | undefined): void {
  const prev = mockUserId;
  mockUserId = next;
  for (const listener of authListeners()) listener({ userId: next }, { userId: prev });
}

const store = () => useAppTourStore.getState();
const celebration = () => useCelebrationStore.getState();

const ADD_FAB = findTourStepIndex("firstExpense", "addFab");
const FAB_MANUAL = findTourStepIndex("firstExpense", "fabManual");
const HOME_RECENT = findTourStepIndex("firstExpense", "homeRecent");

/** Puts a running first-run tour on a given step. */
function runningOn(stepId: string, startedFrom: "auto" | "replay" = "auto"): void {
  store().start("firstExpense", startedFrom);
  useAppTourStore.setState({ stepIndex: findTourStepIndex("firstExpense", stepId) });
}

/** Puts a running tab tour on a given step. */
function tourOn(tourId: TourId, stepId: string): void {
  store().start(tourId);
  useAppTourStore.setState({ stepIndex: findTourStepIndex(tourId, stepId) });
}

const lastIndex = (tourId: TourId) => getTour(tourId).steps.length - 1;

describe("app tour store", () => {
  beforeEach(() => {
    resetMockMmkv();
    mockUserId = "user-a";
    useAppTourStore.setState({
      active: false,
      tourId: "firstExpense",
      stepIndex: 0,
      userId: undefined,
      startedFrom: "auto",
      retry: false,
      direction: 1,
      doneCount: 0,
      completion: null,
      celebrated: false,
      autoStartSuppressed: false,
    });
    useAgentChatUiStore.setState({ visible: false });
    useAddTransactionFabStore.setState({ fabOpen: false });
    useCelebrationStore.setState({
      event: null,
      reduceMotion: false,
      suppressed: false,
    });
    useTourPreviewStore.setState({
      active: false,
      userId: undefined,
      domains: [],
      suspended: false,
      accountEmpty: null,
      shown: 0,
    });
  });

  it("starts inactive", () => {
    expect(store().active).toBe(false);
  });

  it("start activates the first-run tour at the first step for the signed-in user", () => {
    store().start();
    expect(store()).toMatchObject({
      active: true,
      tourId: "firstExpense",
      stepIndex: 0,
      userId: "user-a",
      startedFrom: "auto",
      retry: false,
    });
  });

  it.each(TOUR_ORDER)("%s can be started, walked to its end with next, and is then seen", (id) => {
    store().start(id);
    expect(store()).toMatchObject({ active: true, tourId: id, stepIndex: 0, userId: "user-a" });
    const steps = getTour(id).steps;
    for (let index = 0; index < steps.length; index += 1) {
      expect(store().stepIndex).toBe(index);
      store().next();
    }
    expect(store().active).toBe(false);
    expect(isTourSeen(id, "user-a")).toBe(true);
    // Every other tour is still unseen.
    expect(TOUR_ORDER.filter((other) => isTourSeen(other, "user-a"))).toEqual([id]);
  });

  it.each(TOUR_ORDER)("%s can be left from any step with skip, which marks only it as seen", (id) => {
    const steps = getTour(id).steps;
    for (let index = 0; index < steps.length; index += 1) {
      resetMockMmkv();
      store().start(id);
      for (let i = 0; i < index; i += 1) store().next();
      store().skip();
      expect(store().active).toBe(false);
      expect(TOUR_ORDER.filter((other) => isTourSeen(other, "user-a"))).toEqual([id]);
    }
  });

  it("start is a no-op while a tour is running", () => {
    store().start();
    store().next();
    store().start("home", "replay");
    expect(store().tourId).toBe("firstExpense");
    expect(store().stepIndex).toBe(1);
    expect(store().startedFrom).toBe("auto");
  });

  it("every start gets a new run id, so the overlay starts fresh for the next tour", () => {
    store().start("home");
    const first = store().runId;
    store().skip();
    store().start("budgets");
    expect(store().runId).toBe(first + 1);
  });

  it("next and back move one step and clamp at the first step", () => {
    store().start();
    store().back();
    expect(store().stepIndex).toBe(0);
    store().next();
    store().next();
    expect(store().stepIndex).toBe(2);
    store().back();
    expect(store().stepIndex).toBe(1);
  });

  it("does nothing while inactive", () => {
    store().next();
    store().back();
    store().skip();
    store().finish();
    store().skipUnavailable();
    store().onEvent("daySelected");
    store().onTransactionSaved();
    store().onManualAddAbandoned();
    expect(store()).toMatchObject({ active: false, stepIndex: 0 });
    expect(isAppTourSeen("user-a")).toBe(false);
    expect(celebration().event).toBeNull();
  });

  describe("first-run tour (firstExpense)", () => {
    it("skip ends the tour and remembers it for that user only", () => {
      store().start();
      store().next();
      store().skip();
      expect(store()).toMatchObject({ active: false, stepIndex: 0 });
      expect(isAppTourSeen("user-a")).toBe(true);
      expect(isAppTourSeen("user-b")).toBe(false);
    });

    it("next on the last step finishes the tour and remembers it", () => {
      store().start();
      for (let i = 0; i < lastIndex("firstExpense"); i += 1) {
        store().next();
      }
      expect(store().stepIndex).toBe(lastIndex("firstExpense"));
      expect(isAppTourSeen("user-a")).toBe(false);
      store().next();
      expect(store().active).toBe(false);
      expect(isAppTourSeen("user-a")).toBe(true);
    });

    it("finish ends the tour and remembers it", () => {
      runningOn("finale");
      store().finish();
      expect(store().active).toBe(false);
      expect(isAppTourSeen("user-a")).toBe(true);
    });

    it("can be replayed after it was seen, and records completion again", () => {
      store().start();
      store().skip();
      expect(isAppTourSeen("user-a")).toBe(true);

      store().start("firstExpense", "replay");
      expect(store().active).toBe(true);
      expect(store().stepIndex).toBe(0);
      expect(store().startedFrom).toBe("replay");
      store().skip();
      expect(isAppTourSeen("user-a")).toBe(true);
    });

    it("starting it again after it was seen is a replay without celebrations", () => {
      store().start();
      store().skip();
      store().start("firstExpense");
      expect(store().startedFrom).toBe("replay");
      expect(celebration().suppressed).toBe(true);
    });

    it("keeps its original, versioned storage key", () => {
      store().start();
      store().skip();
      const mmkv = createMMKV({ id: "dime-onboarding" });
      expect(mmkv.getString("app_tour.completed.v1:user-a")).toEqual(expect.any(String));
      expect(mmkv.getString("app_tour.completed.v1:user-b")).toBeUndefined();
    });

    it("counts a signed-out user as having seen it, so it never starts for them", () => {
      expect(isAppTourSeen(undefined)).toBe(true);
    });

    it("does not persist anything when there is no signed-in user", () => {
      mockUserId = undefined;
      store().start();
      store().skip();
      const mmkv = createMMKV({ id: "dime-onboarding" });
      expect(mmkv.getAllKeys()).toEqual([]);
    });

    describe("a transaction is saved from the manual add form", () => {
      it("moves the pencil step on to the Home recap and asks for the big confetti", () => {
        runningOn("fabManual");
        store().onTransactionSaved();
        expect(store().stepIndex).toBe(HOME_RECENT);
        expect(store().active).toBe(true);
        expect(celebration().event).toMatchObject({ kind: "confetti", mode: "particles" });
      });

      it.each(["welcome", "addFab", "homeRecent", "finale"])(
        "is ignored on the %s step",
        (stepId) => {
          runningOn(stepId);
          const index = store().stepIndex;
          store().onTransactionSaved();
          expect(store().stepIndex).toBe(index);
          expect(celebration().event).toBeNull();
        },
      );

      it("advances once, even if the event arrives twice", () => {
        runningOn("fabManual");
        store().onTransactionSaved();
        store().onTransactionSaved();
        expect(store().stepIndex).toBe(HOME_RECENT);
      });

      it("never celebrates a replayed tour, but still moves on", () => {
        runningOn("fabManual", "replay");
        store().onTransactionSaved();
        expect(store().stepIndex).toBe(HOME_RECENT);
        expect(celebration().event).toBeNull();
      });
    });

    describe("the manual add form is closed without saving", () => {
      it("goes back to the + step with the gentler wording", () => {
        runningOn("fabManual");
        store().onManualAddAbandoned();
        expect(store().stepIndex).toBe(ADD_FAB);
        expect(store().retry).toBe(true);
        expect(store().active).toBe(true);
      });

      it("drops the gentler wording once the tour moves on again", () => {
        runningOn("fabManual");
        store().onManualAddAbandoned();
        store().next();
        expect(store().stepIndex).toBe(FAB_MANUAL);
        expect(store().retry).toBe(false);
      });

      it.each(["welcome", "addFab", "homeRecent", "finale"])(
        "is ignored on the %s step",
        (stepId) => {
          runningOn(stepId);
          const index = store().stepIndex;
          store().onManualAddAbandoned();
          expect(store().stepIndex).toBe(index);
          expect(store().retry).toBe(false);
        },
      );

      it("does not undo a save (the form closes right after it)", () => {
        runningOn("fabManual");
        store().onTransactionSaved();
        store().onManualAddAbandoned();
        expect(store().stepIndex).toBe(HOME_RECENT);
      });
    });

    it("waits for the + menu to open (the tour's own watcher raises it), then moves on", () => {
      runningOn("addFab");
      emitTourEvent("fabOpened");
      expect(store().stepIndex).toBe(FAB_MANUAL);
      expect(store().doneCount).toBe(1);
    });
  });

  describe("tab tours", () => {
    it("start at the first step, as a first run until they have been seen", () => {
      store().start("transactions");
      expect(store()).toMatchObject({
        active: true,
        tourId: "transactions",
        stepIndex: 0,
        startedFrom: "auto",
        direction: 1,
        doneCount: 0,
      });
    });

    it("start as a replay once seen", () => {
      markTourSeen("budgets", "user-a");
      store().start("budgets");
      expect(store().startedFrom).toBe("replay");
    });

    it("do not suppress celebrations (only a replayed first-run tour does)", () => {
      markTourSeen("home", "user-a");
      store().start("home");
      expect(celebration().suppressed).toBe(false);
      store().skip();

      store().start("firstExpense", "replay");
      expect(celebration().suppressed).toBe(true);
    });

    it("skip marks that tour seen for that user only, and no other tour", () => {
      store().start("insights");
      store().skip();
      expect(isTourSeen("insights", "user-a")).toBe(true);
      expect(isTourSeen("insights", "user-b")).toBe(false);
      expect(isTourSeen("home", "user-a")).toBe(false);
      expect(isAppTourSeen("user-a")).toBe(false);
    });

    it("stores seen state under a per-user, per-tour, versioned key", () => {
      store().start("askAi");
      store().skip();
      const mmkv = createMMKV({ id: "dime-onboarding" });
      expect(mmkv.getString("app_tour.tab.v1:askAi:user-a")).toEqual(expect.any(String));
      expect(mmkv.getString("app_tour.tab.v1:askAi:user-b")).toBeUndefined();
      expect(mmkv.getString("app_tour.tab.v1:home:user-a")).toBeUndefined();
    });

    it("never writes anything on a tour's steps, only its own seen state", () => {
      store().start("home");
      store().next();
      store().next();
      store().skip();
      const mmkv = createMMKV({ id: "dime-onboarding" });
      expect(mmkv.getAllKeys()).toEqual(["app_tour.tab.v1:home:user-a"]);
    });

    describe("events", () => {
      it("complete only the Do step waiting for exactly that event", () => {
        tourOn("transactions", "pickDay");
        const index = store().stepIndex;
        emitTourEvent("monthChanged");
        expect(store().stepIndex).toBe(index);
        expect(store().doneCount).toBe(0);

        emitTourEvent("daySelected");
        expect(store().stepIndex).toBe(index + 1);
        expect(store().doneCount).toBe(1);
        expect(store().direction).toBe(1);
      });

      it("are ignored on a Watch step", () => {
        tourOn("transactions", "calendar");
        emitTourEvent("daySelected");
        expect(store().stepIndex).toBe(0);
      });

      it("move a step on once, even if the event arrives twice", () => {
        tourOn("transactions", "pickDay");
        const index = store().stepIndex;
        emitTourEvent("daySelected");
        emitTourEvent("daySelected");
        expect(store().stepIndex).toBe(index + 1);
        expect(store().doneCount).toBe(1);
      });

      it("do nothing while no tour is running", () => {
        emitTourEvent("daySelected");
        expect(store().active).toBe(false);
        expect(store().doneCount).toBe(0);
      });
    });

    describe("back and skipping unavailable steps", () => {
      it("back goes to the previous step and clears nothing else", () => {
        tourOn("home", "stats");
        store().back();
        expect(store().stepIndex).toBe(0);
        expect(store().direction).toBe(-1);
      });

      it("skipUnavailable keeps going the way the user was going", () => {
        tourOn("home", "stats");
        store().next();
        const upcoming = store().stepIndex;
        store().skipUnavailable();
        expect(store().stepIndex).toBe(upcoming + 1);

        store().back();
        const afterBack = store().stepIndex;
        store().skipUnavailable();
        expect(store().stepIndex).toBe(afterBack - 1);
      });

      it("skipUnavailable stops at the ends of the tour", () => {
        store().start("home");
        useAppTourStore.setState({ direction: -1 });
        store().skipUnavailable();
        expect(store().stepIndex).toBe(0);
      });
    });

    describe("finishing", () => {
      it("reaching the finish card marks the tour seen and reports the progress", () => {
        markTourSeen("firstExpense", "user-a");
        tourOn("home", "detail");
        store().next();
        expect(getTour("home").steps[store().stepIndex].kind).toBe("finale");
        expect(isTourSeen("home", "user-a")).toBe(true);
        expect(store().completion).toMatchObject({
          tourId: "home",
          firstTime: true,
          seenCount: 2,
          total: TOUR_ORDER.length,
          allDone: false,
          nextTourId: "transactions",
          celebration: "full",
        });
      });

      it("a replay gets the lighter confetti, never the big one", () => {
        markTourSeen("home", "user-a");
        tourOn("home", "detail");
        store().next();
        expect(store().completion).toMatchObject({
          firstTime: false,
          celebration: "medium",
        });
      });

      it("offers the next unseen tour, wrapping round, and none when all are seen", () => {
        for (const id of TOUR_ORDER) {
          if (id !== "addMenu" && id !== "home") markTourSeen(id, "user-a");
        }
        tourOn("addMenu", "photo");
        store().next();
        expect(store().completion?.nextTourId).toBe("home");
      });

      it("finishing the last unseen tour is the big moment and stores Tour master", () => {
        for (const id of TOUR_ORDER) {
          if (id !== "addMenu") markTourSeen(id, "user-a");
        }
        tourOn("addMenu", "photo");
        store().next();
        expect(store().completion).toMatchObject({
          allDone: true,
          seenCount: TOUR_ORDER.length,
          nextTourId: null,
          celebration: "grand",
        });
        const mmkv = createMMKV({ id: "dime-onboarding" });
        expect(mmkv.getString("app_tour.master.v1:user-a")).toEqual(expect.any(String));
      });

      it("seeing every tour by replaying them is not the big moment", () => {
        for (const id of TOUR_ORDER) {
          markTourSeen(id, "user-a");
        }
        tourOn("home", "detail");
        store().next();
        expect(store().completion).toMatchObject({ allDone: false, celebration: "medium" });
      });

      it("works the finish card out once per run: going back and forward reuses it", () => {
        for (const id of TOUR_ORDER) {
          if (id !== "addMenu") markTourSeen(id, "user-a");
        }
        tourOn("addMenu", "photo");
        store().next();
        const first = store().completion;
        expect(first).toMatchObject({ allDone: true, celebration: "grand", firstTime: true });
        store().back();
        store().next();
        expect(store().completion).toBe(first);
        expect(store().completion?.celebration).toBe("grand");
      });

      it("the celebration plays once per run (a pause and resume remounts the overlay)", () => {
        tourOn("home", "detail");
        store().next();
        expect(store().celebrated).toBe(false);
        store().markCelebrated();
        store().back();
        store().next();
        expect(store().celebrated).toBe(true);
        store().skip();
        store().start("home");
        expect(store().celebrated).toBe(false);
      });

      it("Done closes the tour (it was already marked seen)", () => {
        tourOn("home", "detail");
        store().next();
        store().next();
        expect(store().active).toBe(false);
        expect(isTourSeen("home", "user-a")).toBe(true);
      });
    });

    describe("sample data", () => {
      it("a tour that may show it lets its screens, and ends the preview with the tour", () => {
        store().start("budgets");
        expect(useTourPreviewStore.getState()).toMatchObject({
          active: true,
          userId: "user-a",
        });
        expect(useTourPreviewStore.getState().domains).toEqual(
          getTour("budgets").sample,
        );
        store().skip();
        expect(useTourPreviewStore.getState().active).toBe(false);
      });

      it("the first-run tour never shows sample data", () => {
        store().start("firstExpense");
        expect(useTourPreviewStore.getState().active).toBe(false);
      });
    });
  });

  it("a user change mid-tour ends the tour without marking either user as seen", () => {
    store().start("home");
    expect(store().active).toBe(true);
    expect(useTourPreviewStore.getState().active).toBe(true);
    switchUser("user-b");
    expect(store().active).toBe(false);
    expect(store().stepIndex).toBe(0);
    expect(useTourPreviewStore.getState().active).toBe(false);
    expect(isTourSeen("home", "user-a")).toBe(false);
    expect(isTourSeen("home", "user-b")).toBe(false);
  });

  describe("a user change mid-tour puts the app back as the tour found it", () => {
    it("closes the Ask AI chat the tour opened, without marking anything seen", () => {
      store().start("askAi");
      useAgentChatUiStore.getState().open();
      switchUser("user-b");
      expect(useAgentChatUiStore.getState().visible).toBe(false);
      expect(isTourSeen("askAi", "user-a")).toBe(false);
      expect(isTourSeen("askAi", "user-b")).toBe(false);
    });

    it("closes the + menu the tour opened", () => {
      store().start("addMenu");
      useAddTransactionFabStore.getState().setFabOpen(true);
      switchUser("user-b");
      expect(useAddTransactionFabStore.getState().fabOpen).toBe(false);
      expect(store().active).toBe(false);
    });
  });

  describe("a tour the user chose", () => {
    it("keeps the first-run tour from starting by itself afterwards, until another account signs in", () => {
      expect(store().autoStartSuppressed).toBe(false);
      store().suppressAutoStart();
      store().start("home");
      store().skip();
      expect(store().autoStartSuppressed).toBe(true);
      switchUser("user-b");
      expect(store().autoStartSuppressed).toBe(false);
    });
  });

  describe("celebrations follow the tour", () => {
    it("are suppressed for a replay and allowed again once it ends", () => {
      store().start("firstExpense", "replay");
      expect(celebration().suppressed).toBe(true);
      store().skip();
      expect(celebration().suppressed).toBe(false);

      store().start("firstExpense", "auto");
      expect(celebration().suppressed).toBe(false);
    });

    it("are allowed again after a replay is finished or interrupted by a user change", () => {
      runningOn("finale", "replay");
      store().finish();
      expect(celebration().suppressed).toBe(false);

      store().start("firstExpense", "replay");
      switchUser("user-b");
      expect(celebration().suppressed).toBe(false);
    });
  });
});
