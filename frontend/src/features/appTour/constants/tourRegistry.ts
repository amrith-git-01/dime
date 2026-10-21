import { firstExpenseTour } from "./firstExpenseTour";
import { addMenuTour, askAiTour } from "./featureTours";
import {
  budgetsTour,
  homeTour,
  insightsTour,
  transactionsTour,
} from "./tabTours";
import type {
  TourDefinition,
  TourId,
  TourScreen,
  TourStep,
  TourTab,
} from "./tourTypes";

/** Every tour, by id. */
export const TOURS: Record<TourId, TourDefinition> = {
  firstExpense: firstExpenseTour,
  home: homeTour,
  transactions: transactionsTour,
  budgets: budgetsTour,
  insights: insightsTour,
  askAi: askAiTour,
  addMenu: addMenuTour,
};

/** The order tours are listed in (Settings → Tours) and "Up next" walks through. */
export const TOUR_ORDER: readonly TourId[] = [
  "firstExpense",
  "home",
  "transactions",
  "budgets",
  "insights",
  "askAi",
  "addMenu",
];

export const TOUR_COUNT = TOUR_ORDER.length;

export function getTour(id: TourId): TourDefinition {
  return TOURS[id];
}

/** The tour the "?" of a tab opens. */
export function tourIdForTab(tab: TourTab): TourId {
  switch (tab) {
    case "Home":
      return "home";
    case "Transactions":
      return "transactions";
    case "Budgets":
      return "budgets";
    case "Insights":
      return "insights";
  }
}

/** Index of the step with this id in a tour (-1 when there is none). */
export function findTourStepIndex(id: TourId, stepId: string): number {
  return TOURS[id].steps.findIndex((step) => step.id === stepId);
}

/** The steps the user goes through (everything except the welcome and finish cards). */
function isActionStep(step: TourStep): boolean {
  return step.kind === "watch" || step.kind === "do";
}

/** How many numbered steps a tour has ("Step 2 of 6"). */
export function getTourActionStepCount(id: TourId): number {
  return TOURS[id].steps.filter(isActionStep).length;
}

/** 1-based position among the numbered steps; null for the welcome and finish cards. */
export function getTourActionStepNumber(
  id: TourId,
  stepIndex: number,
): number | null {
  const steps = TOURS[id].steps;
  const step = steps[stepIndex];
  if (!step || !isActionStep(step)) {
    return null;
  }
  return steps.slice(0, stepIndex + 1).filter(isActionStep).length;
}

/** The screen a step shows on (its own, else the tour's tab); undefined when it does not care. */
export function getStepScreen(
  id: TourId,
  step: TourStep,
): TourScreen | undefined {
  return step.screen ?? TOURS[id].tab;
}

const ALL_TABS: readonly TourTab[] = [
  "Home",
  "Transactions",
  "Budgets",
  "Insights",
];

/**
 * Every screen a tour may be on without being paused: its own tab and the screens its steps visit
 * (a tour that works over any tab, like Ask AI or the + menu, owns all four).
 */
export function getTourOwnedScreens(id: TourId): ReadonlySet<TourScreen> {
  const tour = TOURS[id];
  const owned = new Set<TourScreen>(
    tour.tab && !tour.ownsAllTabs ? [tour.tab] : ALL_TABS,
  );
  for (const step of tour.steps) {
    if (step.screen) {
      owned.add(step.screen);
    }
  }
  return owned;
}
