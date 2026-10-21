import { createMMKV } from "react-native-mmkv";

import { subscribeTourSeen } from "@/lib/onboarding/appTourStorage";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { TOUR_ORDER } from "../../constants/tourRegistry";
import type { TourId } from "../../constants/tourTypes";
import {
  getSeenTourIds,
  haveAllToursBeenSeen,
  isTourSeen,
  markTourSeen,
  pickNextUnseenTour,
} from "../tourSeen";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

beforeEach(resetMockMmkv);

describe("tour seen state", () => {
  it("is kept per user and per tour", () => {
    expect(isTourSeen("home", "a")).toBe(false);
    markTourSeen("home", "a");
    expect(isTourSeen("home", "a")).toBe(true);
    expect(isTourSeen("home", "b")).toBe(false);
    expect(isTourSeen("budgets", "a")).toBe(false);
    expect(getSeenTourIds("a")).toEqual(["home"]);
  });

  it("keeps the first-run tour on its original key and the others under app_tour.tab.v1", () => {
    markTourSeen("firstExpense", "a");
    markTourSeen("insights", "a");
    const mmkv = createMMKV({ id: "dime-onboarding" });
    expect(mmkv.getString("app_tour.completed.v1:a")).toEqual(expect.any(String));
    expect(mmkv.getString("app_tour.tab.v1:insights:a")).toEqual(expect.any(String));
    expect(mmkv.getString("app_tour.tab.v1:firstExpense:a")).toBeUndefined();
  });

  it("counts a signed-out user as having seen everything, and stores nothing for them", () => {
    expect(isTourSeen("home", undefined)).toBe(true);
    markTourSeen("home", undefined);
    expect(createMMKV({ id: "dime-onboarding" }).getAllKeys()).toEqual([]);
    expect(getSeenTourIds(undefined)).toEqual([]);
  });

  it("tells subscribers when a tour becomes seen", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeTourSeen(listener);
    markTourSeen("home", "a");
    markTourSeen("firstExpense", "a");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    markTourSeen("budgets", "a");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("returns seen ids in listing order", () => {
    markTourSeen("insights", "a");
    markTourSeen("firstExpense", "a");
    markTourSeen("home", "a");
    expect(getSeenTourIds("a")).toEqual(["firstExpense", "home", "insights"]);
  });
});

describe("up next", () => {
  const seenSet = (ids: TourId[]) => new Set<TourId>(ids);

  it("is the next unseen tour in listing order", () => {
    expect(pickNextUnseenTour(seenSet(["firstExpense", "home"]), "home")).toBe("transactions");
    expect(
      pickNextUnseenTour(seenSet(["firstExpense", "home", "transactions"]), "home"),
    ).toBe("budgets");
  });

  it("wraps round to the start", () => {
    const all = TOUR_ORDER.filter((id) => id !== "firstExpense");
    expect(pickNextUnseenTour(seenSet(all), "addMenu")).toBe("firstExpense");
  });

  it("is null when every tour is seen", () => {
    expect(pickNextUnseenTour(seenSet([...TOUR_ORDER]), "home")).toBeNull();
    expect(haveAllToursBeenSeen(seenSet([...TOUR_ORDER]))).toBe(true);
    expect(haveAllToursBeenSeen(seenSet(["home"]))).toBe(false);
  });

  it("never offers the tour just finished", () => {
    expect(pickNextUnseenTour(seenSet(["firstExpense"]), "home")).not.toBe("home");
  });
});
