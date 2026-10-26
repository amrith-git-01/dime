import type { TourTargetId } from "@/constants/tourTargetIds";
import type { CardId } from "@/features/cardLayout/cardIds";
import type { SampleDomain } from "@/features/tourPreview/types";
import type { TourScrollKey } from "@/lib/tour/tourScrollRegistry";

import type { TourIconSpec } from "./tourIcons";

export type TourId =
  | "firstExpense"
  | "home"
  | "transactions"
  | "budgets"
  | "insights"
  | "askAi"
  | "addMenu";

export type TourTab = "Home" | "Transactions" | "Budgets" | "Insights";

/**
 * Screens a step can show on. The tabs the tour can switch to itself; the stack screens are
 * reached by the user's tap on the step before (or by an `enter` action) and the tour waits for them.
 */
export type TourScreen =
  | TourTab
  | "TransactionDetail"
  | "TransactionsList"
  | "RecurringEditor"
  | "InsightsMonthCompare";

/** Side effects a step runs when it becomes the current one (see `runTourStepEnter`). */
export type TourEnterAction =
  | "closeFab"
  | "openFab"
  | "openAgent"
  | "closeAgent"
  | "openCompare";

/**
 * What a "Do" step's card button does on the user's behalf, for people who cannot find or reach
 * the target. `openFab` / `openManualAdd` are built in; the rest are commands registered by the
 * screen that owns the action (see `useTourCommand`).
 */
export type TourCardAction =
  | "openFab"
  | "openManualAdd"
  | "homeOpenTransaction"
  | "txPickDay"
  | "txOpenTransaction"
  | "txSwitchMonth"
  | "budgetsOpenRecurring"
  | "budgetsOpenCategory"
  | "insightsOpenPayee"
  | "agentAskSample";

/**
 * - `welcome`: the opening card of a tour (no target, centered).
 * - `watch`: spotlights something and waits for Next.
 * - `do`: spotlights something and waits for the user to really tap it (`advanceOn`); the hole lets
 *   the tap through, and the card has a button that does it for them.
 * - `finale`: the closing card.
 */
export type TourStepKind = "welcome" | "watch" | "do" | "finale";

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
  /** Screen to be on while the step shows; defaults to the tour's own tab. */
  screen?: TourScreen;
  /**
   * The Home / Budgets / Insights card this step is about. The user can arrange those cards, so
   * a tab tour puts its card steps in the order of the cards on screen when it starts
   * (see `sortTourStepsByCardOrder`). Steps without one (a screen the tour opens, the finish
   * card) follow the card step before them.
   */
  cardId?: CardId;
  /** Stays after all the card steps, just before the finish card, whatever order the cards are in. */
  atEnd?: boolean;
  /** Scrolls this screen's list so the target is in view before the spotlight lands on it. */
  scrollKey?: TourScrollKey;
  /** Scrolled to first while the target itself is not mounted (a row beyond a list's draw distance). */
  revealVia?: TourTargetId;
  /** Shown in a round badge on the card. */
  icon?: TourIconSpec;
  title: string;
  body: string;
  /** Short nudge on "Do" steps (defaults to "Try it: tap the highlighted spot"). */
  hint?: string;
  placement: TourPlacementPreference;
  shape: TourSpotlightShape;
  /** Corner radius of the hole when `shape` is `rounded`. */
  radius?: number;
  /** Breathing room between the element and the hole's edge. */
  padding: number;
  /** Keeps the add-transaction menu from auto-closing while the step shows. */
  holdFab?: boolean;
  enter?: readonly TourEnterAction[];
  /**
   * The tour event that completes a "Do" step (see `tourEventNames`). `transactionSaved` is raised
   * by the manual add screen's save, because the tour overlay is not mounted while it is open.
   */
  advanceOn?: string;
  /** A card button that performs the step's action (every "Do" step has one). */
  action?: TourCardAction;
  actionLabel?: string;
  /** Body shown instead of `body` after the user wandered off and came back to this step. */
  retryBody?: string;
  /** Primary / secondary labels; the default primary is "Next". */
  primaryLabel?: string;
  skipLabel?: string;
  /** Skipped (in either direction) when its target or screen never shows up, instead of a centered card. */
  optional?: boolean;
  /** Hardware back leaves the tour on this step instead of going back one step. */
  backExits?: boolean;
};

export type TourDefinition = {
  id: TourId;
  title: string;
  /** One line for Settings → Tours. */
  summary: string;
  icon: TourIconSpec;
  /** "~25 s" */
  durationLabel: string;
  /** The tab the tour belongs to and starts on; none for Ask AI, which runs over any tab. */
  tab?: TourTab;
  steps: readonly TourStep[];
  /** Starts by itself for a new user (the first-expense tour only). */
  autoStart?: boolean;
  /** The first time it is finished, it gets the full confetti (later runs get the lighter one). */
  celebratesFirstRun?: boolean;
  /** The tour works over whichever tab is open (the + menu is on every tab), not only its own. */
  ownsAllTabs?: boolean;
  /** The tour opens the Ask AI chat itself, so that chat does not pause it (voice and receipt capture still do). */
  allowsAgentChat?: boolean;
  /** Sample data may fill empty screens of these kinds while the tour runs. */
  sample?: readonly SampleDomain[];
  /** The tour shows a scripted conversation in the Ask AI chat (no model call, no usage). */
  scriptedChat?: boolean;
  /** Put the app back as it was when the tour ends, however it ends. */
  cleanup?: readonly TourEnterAction[];
};
