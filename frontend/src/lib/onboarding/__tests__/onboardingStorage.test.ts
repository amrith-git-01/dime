import { createMMKV } from "react-native-mmkv";

import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { getChecklistPersisted, setChecklistPersisted } from "../checklistStorage";
import {
  hasSeenFirstUseTip,
  markFirstUseTipSeen,
  subscribeFirstUseTips,
} from "../firstUseTipStorage";
import { getStoredGoal, setStoredGoal } from "../goalStorage";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

beforeEach(resetMockMmkv);

describe("checklist storage", () => {
  it("starts empty and round-trips per user", () => {
    expect(getChecklistPersisted("a")).toEqual({
      baselined: false,
      seen: [],
      hidden: false,
      retired: false,
    });
    setChecklistPersisted("a", { baselined: true, seen: ["budget"], hidden: true, retired: false });
    expect(getChecklistPersisted("a")).toEqual({
      baselined: true,
      seen: ["budget"],
      hidden: true,
      retired: false,
    });
    expect(getChecklistPersisted("b").baselined).toBe(false);
  });

  it("drops unknown item ids and survives unreadable data", () => {
    const store = createMMKV({ id: "dime-onboarding" });
    store.set("checklist.state.v1:a", JSON.stringify({ baselined: true, seen: ["budget", "nope", 3] }));
    expect(getChecklistPersisted("a").seen).toEqual(["budget"]);
    store.set("checklist.state.v1:a", "{not json");
    expect(getChecklistPersisted("a").baselined).toBe(false);
  });
});

describe("goal storage", () => {
  it("round-trips the goal and the suggested budget per user", () => {
    expect(getStoredGoal("a")).toBeNull();
    setStoredGoal("a", { goal: "budget", budgetAmount: 30000 });
    expect(getStoredGoal("a")).toEqual({ goal: "budget", budgetAmount: 30000 });
    setStoredGoal("a", { goal: "save" });
    expect(getStoredGoal("a")).toEqual({ goal: "save" });
    expect(getStoredGoal("b")).toBeNull();
  });

  it("ignores an unknown goal or a bad amount", () => {
    const store = createMMKV({ id: "dime-onboarding" });
    store.set("goal.v1:a", JSON.stringify({ goal: "yolo" }));
    expect(getStoredGoal("a")).toBeNull();
    store.set("goal.v1:a", JSON.stringify({ goal: "budget", budgetAmount: -5 }));
    expect(getStoredGoal("a")).toEqual({ goal: "budget" });
  });
});

describe("first-use tip storage", () => {
  it("remembers a dismissed tip per tip id, for the whole device", () => {
    expect(hasSeenFirstUseTip("voice")).toBe(false);
    markFirstUseTipSeen("voice");
    expect(hasSeenFirstUseTip("voice")).toBe(true);
    expect(hasSeenFirstUseTip("scan")).toBe(false);
  });

  it("tells subscribers when a tip is dismissed", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeFirstUseTips(listener);
    markFirstUseTipSeen("budgets");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    markFirstUseTipSeen("recurring");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
