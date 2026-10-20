import { CHECKLIST_ITEM_IDS } from "../../constants/checklistItems";
import type { ChecklistItemId, OnboardingProgress } from "../../types";
import {
  allChecklistDone,
  checklistFlags,
  checklistRowLabel,
  countDone,
  EMPTY_CHECKLIST_PERSISTED,
  isChecklistVisible,
  observeChecklist,
  orderChecklistItems,
  resolveDone,
  type ChecklistFlags,
  type ChecklistPersisted,
} from "../checklist";

const NO_PROGRESS: OnboardingProgress = {
  first_expense: false,
  voice_or_scan: false,
  budget: false,
  recurring: false,
  asked_ai: false,
};

const flagsWith = (...done: ChecklistItemId[]): ChecklistFlags =>
  ({
    firstExpense: done.includes("firstExpense"),
    voiceOrScan: done.includes("voiceOrScan"),
    budget: done.includes("budget"),
    recurring: done.includes("recurring"),
    widget: done.includes("widget"),
    askAi: done.includes("askAi"),
  });

const persisted = (over: Partial<ChecklistPersisted> = {}): ChecklistPersisted => ({
  ...EMPTY_CHECKLIST_PERSISTED,
  baselined: true,
  ...over,
});

describe("checklistFlags", () => {
  it("maps the server progress and the widget flag onto the six items", () => {
    expect(
      checklistFlags({ ...NO_PROGRESS, first_expense: true, asked_ai: true }, true),
    ).toEqual({
      firstExpense: true,
      voiceOrScan: false,
      budget: false,
      recurring: false,
      widget: true,
      askAi: true,
    });
  });

  it("is all open until the progress loaded", () => {
    expect(countDone(checklistFlags(undefined, false))).toBe(0);
  });
});

describe("orderChecklistItems", () => {
  it("keeps the default order without a goal or for tracking", () => {
    expect(orderChecklistItems(null)).toEqual([...CHECKLIST_ITEM_IDS]);
    expect(orderChecklistItems("track")).toEqual([...CHECKLIST_ITEM_IDS]);
  });

  it("puts the budget second for the budget goal", () => {
    expect(orderChecklistItems("budget")).toEqual([
      "firstExpense",
      "budget",
      "voiceOrScan",
      "recurring",
      "widget",
      "askAi",
    ]);
  });

  it("puts the recurring item second for the save goal", () => {
    const order = orderChecklistItems("save");
    expect(order.slice(0, 2)).toEqual(["firstExpense", "recurring"]);
    expect(order).toHaveLength(CHECKLIST_ITEM_IDS.length);
    expect(new Set(order).size).toBe(CHECKLIST_ITEM_IDS.length);
  });
});

describe("resolveDone", () => {
  it("keeps an item done once it was seen done, even if the data no longer shows it", () => {
    const done = resolveDone(flagsWith(), persisted({ seen: ["voiceOrScan"] }));
    expect(done.voiceOrScan).toBe(true);
    expect(countDone(done)).toBe(1);
  });
});

describe("observeChecklist", () => {
  it("the first look records what is already done, without celebrating", () => {
    const result = observeChecklist(
      flagsWith("firstExpense", "budget"),
      EMPTY_CHECKLIST_PERSISTED,
    );
    expect(result.celebrate).toEqual([]);
    expect(result.showPro).toBe(false);
    expect(result.persisted).toMatchObject({
      baselined: true,
      seen: ["firstExpense", "budget"],
      retired: false,
    });
  });

  it("celebrates an item the first time it is seen done, and only then", () => {
    const first = observeChecklist(
      flagsWith("firstExpense", "voiceOrScan"),
      persisted({ seen: ["firstExpense"] }),
    );
    expect(first.celebrate).toEqual(["voiceOrScan"]);
    expect(first.persisted.seen).toEqual(["firstExpense", "voiceOrScan"]);

    const again = observeChecklist(flagsWith("firstExpense", "voiceOrScan"), first.persisted);
    expect(again.celebrate).toEqual([]);
    expect(again.persisted).toBe(first.persisted);
  });

  it("returns the same state object when nothing changed (no write, no loop)", () => {
    const state = persisted({ seen: ["firstExpense"] });
    expect(observeChecklist(flagsWith("firstExpense"), state).persisted).toBe(state);
  });

  it("celebrates every item that turned done at once", () => {
    const result = observeChecklist(flagsWith("budget", "recurring"), persisted());
    expect(result.celebrate).toEqual(["budget", "recurring"]);
  });

  it("flags the all-done moment when the last item turns done in front of the user", () => {
    const almost = persisted({
      seen: CHECKLIST_ITEM_IDS.filter((id) => id !== "askAi"),
    });
    const result = observeChecklist(flagsWith(...CHECKLIST_ITEM_IDS), almost);
    expect(result.celebrate).toEqual(["askAi"]);
    expect(result.showPro).toBe(true);
    expect(result.persisted.retired).toBe(false);
  });

  it("retires silently when everything was already done at the first look", () => {
    const result = observeChecklist(flagsWith(...CHECKLIST_ITEM_IDS), EMPTY_CHECKLIST_PERSISTED);
    expect(result.showPro).toBe(false);
    expect(result.celebrate).toEqual([]);
    expect(result.persisted.retired).toBe(true);
  });

  it("retires silently when all done is seen again without a new transition", () => {
    const result = observeChecklist(
      flagsWith(...CHECKLIST_ITEM_IDS),
      persisted({ seen: [...CHECKLIST_ITEM_IDS] }),
    );
    expect(result.showPro).toBe(false);
    expect(result.persisted.retired).toBe(true);
  });
});

describe("isChecklistVisible", () => {
  const open = flagsWith("firstExpense");
  const all = flagsWith(...CHECKLIST_ITEM_IDS);
  const base = { persisted: persisted(), done: open, tourActive: false, proShowing: false };

  it("shows while items are open", () => {
    expect(isChecklistVisible(base)).toBe(true);
  });

  it("hides while the tour runs, after Hide, and once retired", () => {
    expect(isChecklistVisible({ ...base, tourActive: true })).toBe(false);
    expect(isChecklistVisible({ ...base, persisted: persisted({ hidden: true }) })).toBe(false);
    expect(isChecklistVisible({ ...base, persisted: persisted({ retired: true }) })).toBe(false);
  });

  it("hides when everything is done, except for the all-done celebration", () => {
    expect(allChecklistDone(all)).toBe(true);
    expect(isChecklistVisible({ ...base, done: all })).toBe(false);
    expect(isChecklistVisible({ ...base, done: all, proShowing: true })).toBe(true);
    expect(isChecklistVisible({ ...base, done: all, proShowing: true, tourActive: true })).toBe(false);
  });
});

describe("checklistRowLabel", () => {
  it("includes the done state for screen readers", () => {
    expect(checklistRowLabel("Set a monthly budget", true)).toBe("Set a monthly budget, done");
    expect(checklistRowLabel("Set a monthly budget", false)).toBe(
      "Set a monthly budget, not done yet",
    );
  });
});
