import { createMMKV } from "react-native-mmkv";

import { resetMockMmkv } from "@/test-utils/mockMmkv";
import { useCelebrationStore } from "@/stores/celebrationStore";

import { findTourStepIndex, TOUR_STEP_COUNT } from "../../constants/tourSteps";
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

const ADD_FAB = findTourStepIndex("addFab");
const FAB_MANUAL = findTourStepIndex("fabManual");
const HOME_RECENT = findTourStepIndex("homeRecent");

/** Puts a running tour on a given step. */
function runningOn(stepId: string, startedFrom: "auto" | "replay" = "auto"): void {
  store().start(startedFrom);
  useAppTourStore.setState({ stepIndex: findTourStepIndex(stepId) });
}

describe("app tour store", () => {
  beforeEach(() => {
    resetMockMmkv();
    mockUserId = "user-a";
    useAppTourStore.setState({
      active: false,
      stepIndex: 0,
      userId: undefined,
      startedFrom: "auto",
      retry: false,
    });
    useCelebrationStore.setState({
      event: null,
      reduceMotion: false,
      suppressed: false,
    });
  });

  it("starts inactive", () => {
    expect(store().active).toBe(false);
  });

  it("start activates the tour at the first step for the signed-in user", () => {
    store().start();
    expect(store()).toMatchObject({
      active: true,
      stepIndex: 0,
      userId: "user-a",
      startedFrom: "auto",
      retry: false,
    });
  });

  it("start is a no-op while a tour is running", () => {
    store().start();
    store().next();
    store().start("replay");
    expect(store().stepIndex).toBe(1);
    expect(store().startedFrom).toBe("auto");
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
    store().onTransactionSaved();
    store().onManualAddAbandoned();
    expect(store()).toMatchObject({ active: false, stepIndex: 0 });
    expect(isAppTourSeen("user-a")).toBe(false);
    expect(celebration().event).toBeNull();
  });

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
    for (let i = 0; i < TOUR_STEP_COUNT - 1; i += 1) {
      store().next();
    }
    expect(store().stepIndex).toBe(TOUR_STEP_COUNT - 1);
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

    store().start("replay");
    expect(store().active).toBe(true);
    expect(store().stepIndex).toBe(0);
    expect(store().startedFrom).toBe("replay");
    store().skip();
    expect(isAppTourSeen("user-a")).toBe(true);
  });

  it("stores completion under a per-user, versioned key", () => {
    store().start();
    store().skip();
    const mmkv = createMMKV({ id: "dime-onboarding" });
    expect(mmkv.getString("app_tour.completed.v1:user-a")).toEqual(
      expect.any(String),
    );
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

  it("a user change mid-tour ends the tour without marking either user as seen", () => {
    store().start();
    expect(store().active).toBe(true);
    switchUser("user-b");
    expect(store().active).toBe(false);
    expect(store().stepIndex).toBe(0);
    expect(isAppTourSeen("user-a")).toBe(false);
    expect(isAppTourSeen("user-b")).toBe(false);
  });

  describe("a transaction is saved from the manual add form", () => {
    it("moves the pencil step on to the Home recap and asks for the big confetti", () => {
      runningOn("fabManual");
      store().onTransactionSaved();
      expect(store().stepIndex).toBe(HOME_RECENT);
      expect(store().active).toBe(true);
      expect(celebration().event).toMatchObject({
        kind: "confetti",
        mode: "particles",
      });
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

  describe("celebrations follow the tour", () => {
    it("are suppressed for a replay and allowed again once it ends", () => {
      store().start("replay");
      expect(celebration().suppressed).toBe(true);
      store().skip();
      expect(celebration().suppressed).toBe(false);

      store().start("auto");
      expect(celebration().suppressed).toBe(false);
    });

    it("are allowed again after a replay is finished or interrupted by a user change", () => {
      runningOn("finale", "replay");
      store().finish();
      expect(celebration().suppressed).toBe(false);

      store().start("replay");
      switchUser("user-b");
      expect(celebration().suppressed).toBe(false);
    });
  });
});
