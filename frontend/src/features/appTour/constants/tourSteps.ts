import { tourTargetIds, type TourTargetId } from "@/constants/tourTargetIds";

export type TourTab = "Home" | "Transactions" | "Budgets" | "Insights";

/** Side effects a step runs when it becomes the current one (see `runTourStepEnter`). */
export type TourEnterAction = "closeFab" | "openFab";

/**
 * What ends a step besides the Next button. `transactionSaved` is raised by the manual add
 * screen's save (see `useAppTourStore.onTransactionSaved`), because the tour overlay is not
 * mounted while that screen is open.
 */
export type TourAdvanceOn = "fabOpened" | "transactionSaved";

/** What a step's card button does on the user's behalf, for people who cannot find the target. */
export type TourCardAction = "openFab" | "openManualAdd";

export type TourStepKind = "welcome" | "spotlight" | "finale";

export type TourSpotlightShape = "rounded" | "circle" | "pill";

export type TourPlacementPreference = "auto" | "above" | "below";

export type TourSidePadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type TourStep = {
  id: string;
  kind: TourStepKind;
  /** Element to spotlight; none means a centered card over the full scrim. */
  targetId?: TourTargetId;
  /** Tab to be on while the step shows. */
  tab?: TourTab;
  title: string;
  body: string;
  /** `tapTarget` lets touches through the hole so the real element can be used. */
  interaction: "next" | "tapTarget";
  placement: TourPlacementPreference;
  shape: TourSpotlightShape;
  /** Corner radius of the hole when `shape` is `rounded`. */
  radius?: number;
  /** Breathing room between the element and the hole's edge. */
  padding: number;
  /** Keeps the add-transaction menu from auto-closing while the step shows. */
  holdFab?: boolean;
  enter?: readonly TourEnterAction[];
  advanceOn?: TourAdvanceOn;
  /** A card button that performs the step's action (every `tapTarget` step has one). */
  action?: TourCardAction;
  actionLabel?: string;
  /** Body shown instead of `body` after the user wandered off and came back to this step. */
  retryBody?: string;
  /** Primary / secondary labels; the default primary is "Next". */
  primaryLabel?: string;
  skipLabel?: string;
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    kind: "welcome",
    tab: "Home",
    title: "Welcome to Dime",
    body: "Let's log your first expense \u2014 about 20 seconds.",
    interaction: "next",
    placement: "auto",
    shape: "rounded",
    padding: 0,
    enter: ["closeFab"],
    primaryLabel: "Start",
    skipLabel: "Not now",
  },
  {
    id: "addFab",
    kind: "spotlight",
    targetId: tourTargetIds.addFab,
    tab: "Home",
    title: "Add what you spent",
    body: "Tap + to add something you spent today.",
    retryBody: "No worries \u2014 tap + whenever you're ready.",
    interaction: "tapTarget",
    placement: "above",
    shape: "circle",
    padding: 10,
    holdFab: true,
    enter: ["closeFab"],
    advanceOn: "fabOpened",
    action: "openFab",
    actionLabel: "Open the + menu",
  },
  {
    id: "fabManual",
    kind: "spotlight",
    targetId: tourTargetIds.fabManual,
    tab: "Home",
    title: "Add it by hand",
    body: "Tap the pencil and type it in. The camera and mic bubbles scan receipts and take voice.",
    interaction: "tapTarget",
    placement: "above",
    shape: "circle",
    padding: 8,
    holdFab: true,
    enter: ["openFab"],
    advanceOn: "transactionSaved",
    action: "openManualAdd",
    actionLabel: "Add it by hand",
  },
  {
    id: "homeRecent",
    kind: "spotlight",
    // The month card, not the Recent list: it is always above the fold and shows the new total.
    targetId: tourTargetIds.homeMonthCard,
    tab: "Home",
    title: "You've started tracking!",
    body: "Done! Your month total and budget update instantly.",
    interaction: "next",
    placement: "auto",
    shape: "rounded",
    radius: 24,
    padding: 4,
    enter: ["closeFab"],
    primaryLabel: "Got it",
  },
  {
    id: "finale",
    kind: "finale",
    tab: "Home",
    title: "You're all set",
    body: "Replay the tour anytime from Settings.",
    interaction: "next",
    placement: "auto",
    shape: "rounded",
    padding: 0,
    primaryLabel: "Finish",
  },
] as const;

export const TOUR_STEP_COUNT = TOUR_STEPS.length;

/** Index of the step with this id (-1 when there is none). */
export function findTourStepIndex(id: string): number {
  return TOUR_STEPS.findIndex((step) => step.id === id);
}

/** The steps the user acts on (everything except the welcome and finale cards). */
export const TOUR_ACTION_STEP_COUNT = TOUR_STEPS.filter(
  (step) => step.kind === "spotlight",
).length;

/** 1-based position among the action steps ("Step 2 of 3"); null for the welcome and finale cards. */
export function getTourActionStepNumber(stepIndex: number): number | null {
  const step = TOUR_STEPS[stepIndex];
  if (!step || step.kind !== "spotlight") {
    return null;
  }
  return (
    TOUR_STEPS.slice(0, stepIndex + 1).filter((s) => s.kind === "spotlight")
      .length
  );
}
