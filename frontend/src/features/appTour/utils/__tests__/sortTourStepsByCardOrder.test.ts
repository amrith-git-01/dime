import { DEFAULT_CARD_ORDER } from "@/features/cardLayout/cardIds";

import { arrangeTour, getTour, TOURS } from "../../constants/tourRegistry";
import type { TourStep } from "../../constants/tourTypes";
import { sortTourStepsByCardOrder } from "../sortTourStepsByCardOrder";

const ids = (steps: readonly TourStep[]) => steps.map((step) => step.id);

function step(id: string, over: Partial<TourStep> = {}): TourStep {
  return {
    id,
    kind: "watch",
    title: id,
    body: id,
    placement: "auto",
    shape: "rounded",
    padding: 0,
    ...over,
  };
}

describe("sortTourStepsByCardOrder", () => {
  const steps = [
    step("one", { cardId: "home.month", enter: ["closeFab"], backExits: true }),
    step("two", { cardId: "home.stats" }),
    step("three", { cardId: "home.recent" }),
    step("detail", { screen: "TransactionDetail" }),
    step("finale", { kind: "finale" }),
  ];

  it("keeps the order when the cards are in their default order", () => {
    const sorted = sortTourStepsByCardOrder(steps, DEFAULT_CARD_ORDER.home);
    expect(ids(sorted)).toEqual(ids(steps));
    expect(sorted).toEqual(steps);
  });

  it("follows the card order, with a follow-up step travelling with its card and the finish card last", () => {
    const sorted = sortTourStepsByCardOrder(steps, ["home.recent", "home.stats", "home.month"]);
    expect(ids(sorted)).toEqual(["three", "detail", "two", "one", "finale"]);
  });

  it("hands the first step's enter actions and backExits to the step that now opens the tour", () => {
    const sorted = sortTourStepsByCardOrder(steps, ["home.recent", "home.stats", "home.month"]);
    expect(sorted[0].enter).toEqual(["closeFab"]);
    expect(sorted[0].backExits).toBe(true);
    const old = sorted.find((s) => s.id === "one");
    expect(old?.enter).toBeUndefined();
    expect(old?.backExits).toBeUndefined();
  });

  it("does not change the steps it is given", () => {
    sortTourStepsByCardOrder(steps, ["home.recent", "home.stats", "home.month"]);
    expect(steps[0].enter).toEqual(["closeFab"]);
    expect(ids(steps)).toEqual(["one", "two", "three", "detail", "finale"]);
  });

  it("keeps a leading welcome card and its enter actions where they are", () => {
    const withWelcome = [
      step("welcome", { kind: "welcome", enter: ["closeFab"] }),
      ...steps.slice(1),
    ];
    const sorted = sortTourStepsByCardOrder(withWelcome, ["home.recent", "home.stats", "home.month"]);
    expect(ids(sorted)).toEqual(["welcome", "three", "detail", "two", "finale"]);
    expect(sorted[0].enter).toEqual(["closeFab"]);
  });

  it("keeps a card's own steps together and in order", () => {
    const two = [
      step("a1", { cardId: "budgets.recurring" }),
      step("b1", { cardId: "budgets.categories" }),
      step("a2", { cardId: "budgets.recurring" }),
      step("a-follow"),
      step("b2", { cardId: "budgets.categories" }),
      step("finale", { kind: "finale" }),
    ];
    expect(ids(sortTourStepsByCardOrder(two, ["budgets.categories", "budgets.recurring"]))).toEqual([
      "b1",
      "b2",
      "a1",
      "a2",
      "a-follow",
      "finale",
    ]);
  });

  it("puts cards that are not in the order last, in their original order", () => {
    const sorted = sortTourStepsByCardOrder(steps, ["home.recent"]);
    expect(ids(sorted)).toEqual(["three", "detail", "one", "two", "finale"]);
  });

  it("leaves a tour without card steps alone", () => {
    const plain = [step("x"), step("y"), step("finale", { kind: "finale" })];
    expect(sortTourStepsByCardOrder(plain, ["anything"])).toEqual(plain);
  });
});

describe("the tab tours follow the card order", () => {
  afterEach(() => {
    arrangeTour("home", undefined);
    arrangeTour("budgets", undefined);
    arrangeTour("insights", undefined);
  });

  it("every card step names a card of its own screen", () => {
    for (const [tourId, screen] of [["home", "home"], ["budgets", "budgets"], ["insights", "insights"]] as const) {
      const known: readonly string[] = DEFAULT_CARD_ORDER[screen];
      for (const s of TOURS[tourId].steps) {
        if (s.cardId) {
          expect(known).toContain(s.cardId);
        }
      }
    }
  });

  it("the default steps are unchanged for the default order", () => {
    for (const tourId of ["home", "budgets", "insights"] as const) {
      arrangeTour(tourId, DEFAULT_CARD_ORDER[tourId]);
      expect(ids(getTour(tourId).steps)).toEqual(ids(TOURS[tourId].steps));
    }
  });

  it("Home: reversed cards give recent first, and its detail step follows it", () => {
    arrangeTour("home", [...DEFAULT_CARD_ORDER.home].reverse());
    expect(ids(getTour("home").steps)).toEqual([
      "recent",
      "detail",
      "categories",
      "upcoming",
      "stats",
      "monthCard",
      "finale",
    ]);
    expect(getTour("home").steps[0].enter).toEqual(["closeFab"]);
    expect(getTour("home").steps[0].backExits).toBe(true);
    // The tour's own definition is not touched.
    expect(TOURS.home.steps[0].id).toBe("monthCard");
  });

  it("Budgets: categories first brings its category steps along; recurring keeps its editor", () => {
    arrangeTour("budgets", ["budgets.categories", "budgets.recurring", "budgets.summary"]);
    expect(ids(getTour("budgets").steps)).toEqual([
      "categoriesHeader",
      "openCategory",
      "categoryList",
      "recurring",
      "recurringItem",
      "editor",
      "summary",
      "finale",
    ]);
  });

  it("Insights: the payee list follows the payees step and Compare keeps its screen after it", () => {
    arrangeTour("insights", [
      "insights.compare",
      "insights.payees",
      "insights.cashflow",
      "insights.summary",
    ]);
    expect(ids(getTour("insights").steps)).toEqual([
      "compare",
      "compareScreen",
      "payees",
      "payeeList",
      "cashflow",
      "summary",
      "finale",
    ]);
  });

  it("an order of no cards, or none at all, goes back to the written steps", () => {
    arrangeTour("home", [...DEFAULT_CARD_ORDER.home].reverse());
    arrangeTour("home", undefined);
    expect(getTour("home")).toBe(TOURS.home);
  });

  it("tours without cards are never rearranged", () => {
    arrangeTour("firstExpense", ["home.recent"]);
    expect(getTour("firstExpense")).toBe(TOURS.firstExpense);
  });
});
