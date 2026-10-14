import { createMMKV } from "react-native-mmkv";

import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { TOUR_STEP_COUNT } from "../../constants/tourSteps";
import { isAppTourSeen, useAppTourStore } from "../appTourStore";

jest.mock("react-native-mmkv", () =>
  jest.requireActual("@/test-utils/mockMmkv"),
);

let mockUserId: string | undefined = "user-a";
jest.mock("@/stores/authSessionStore", () => ({
  useAuthSessionStore: { getState: () => ({ userId: mockUserId }) },
}));

const store = () => useAppTourStore.getState();

describe("app tour store", () => {
  beforeEach(() => {
    resetMockMmkv();
    mockUserId = "user-a";
    useAppTourStore.setState({ active: false, stepIndex: 0, userId: undefined });
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
    });
  });

  it("start is a no-op while a tour is running", () => {
    store().start();
    store().next();
    store().start();
    expect(store().stepIndex).toBe(1);
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
    expect(store()).toMatchObject({ active: false, stepIndex: 0 });
    expect(isAppTourSeen("user-a")).toBe(false);
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

  it("can be replayed after it was seen, and records completion again", () => {
    store().start();
    store().skip();
    expect(isAppTourSeen("user-a")).toBe(true);

    store().start();
    expect(store().active).toBe(true);
    expect(store().stepIndex).toBe(0);
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
});
