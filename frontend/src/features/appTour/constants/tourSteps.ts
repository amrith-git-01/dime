import { tourTargetIds, type TourTargetId } from "@/constants/tourTargetIds";

export type TourTab = "Home" | "Transactions" | "Budgets" | "Insights";

/** Side effects a step runs when it becomes the current one (see `runTourStepEnter`). */
export type TourEnterAction = "closeFab" | "openFab" | "scrollToRecurring";

/** What ends a step besides the Next button. */
export type TourAdvanceOn = "fabOpened";

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
    body: "Let's take a 30-second tour of the few things worth knowing. You can skip it any time.",
    interaction: "next",
    placement: "auto",
    shape: "rounded",
    padding: 0,
    enter: ["closeFab"],
    primaryLabel: "Start the tour",
    skipLabel: "Not now",
  },
  {
    id: "monthCard",
    kind: "spotlight",
    targetId: tourTargetIds.homeMonthCard,
    tab: "Home",
    title: "Your month at a glance",
    body: "What you've spent, what's left of your budget and how much you've used. It updates the moment you add something.",
    interaction: "next",
    placement: "below",
    shape: "rounded",
    radius: 32,
    padding: 6,
  },
  {
    id: "addFab",
    kind: "spotlight",
    targetId: tourTargetIds.addFab,
    tab: "Home",
    title: "Tap + to add an expense",
    body: "Go on, tap the plus button to see the ways to add one.",
    interaction: "tapTarget",
    placement: "above",
    shape: "circle",
    padding: 10,
    holdFab: true,
    enter: ["closeFab"],
    advanceOn: "fabOpened",
  },
  {
    id: "fabMenu",
    kind: "spotlight",
    targetId: tourTargetIds.fabMenu,
    tab: "Home",
    title: "Three ways to log",
    body: "Type it in, snap a photo of the receipt, or just say it out loud. Dime does the typing for you.",
    interaction: "next",
    placement: "above",
    shape: "rounded",
    radius: 36,
    padding: 10,
    holdFab: true,
    enter: ["openFab"],
  },
  {
    id: "agentFab",
    kind: "spotlight",
    targetId: tourTargetIds.agentFab,
    tab: "Home",
    title: "Ask Dime anything",
    body: "Chat about your money in plain words: \"How much did I spend on food last week?\"",
    interaction: "next",
    placement: "above",
    shape: "circle",
    padding: 10,
    enter: ["closeFab"],
  },
  {
    id: "dayAdd",
    kind: "spotlight",
    targetId: tourTargetIds.transactionsDayAdd,
    tab: "Transactions",
    title: "Add to any past day",
    body: "Forgot to log something? Pick a day on the calendar, then tap Add to date it correctly.",
    interaction: "next",
    placement: "below",
    shape: "pill",
    padding: 8,
  },
  {
    id: "recurring",
    kind: "spotlight",
    targetId: tourTargetIds.budgetsRecurring,
    tab: "Budgets",
    title: "Budgets and recurring money",
    body: "Set a monthly budget, then add your recurring income and expenses here so you always see what's coming up.",
    interaction: "next",
    placement: "below",
    shape: "rounded",
    radius: 24,
    padding: 4,
    enter: ["scrollToRecurring"],
  },
  {
    id: "insights",
    kind: "spotlight",
    targetId: tourTargetIds.insightsSummary,
    tab: "Insights",
    title: "See where your money goes",
    body: "Charts, top payees and month-to-month comparisons turn your history into answers.",
    interaction: "next",
    placement: "below",
    shape: "rounded",
    radius: 28,
    padding: 6,
  },
  {
    id: "settings",
    kind: "spotlight",
    targetId: tourTargetIds.headerSettings,
    tab: "Home",
    title: "Make Dime yours",
    body: "Appearance, notifications and haptics live in Settings. You can replay this tour from there too.",
    interaction: "next",
    placement: "below",
    shape: "circle",
    padding: 8,
  },
  {
    id: "finale",
    kind: "finale",
    tab: "Home",
    title: "You're all set!",
    body: "That's the tour. Log your first expense and watch your month come alive.",
    interaction: "next",
    placement: "auto",
    shape: "rounded",
    padding: 0,
    primaryLabel: "Add my first expense",
    skipLabel: "Done",
  },
] as const;

export const TOUR_STEP_COUNT = TOUR_STEPS.length;
