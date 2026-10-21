import { format, startOfMonth, subMonths } from "date-fns";

import { navigationRef } from "@/navigation/navigationRef";
import { runTourCommand } from "@/lib/tour/tourCommandRegistry";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";
import { useAgentChatUiStore } from "@/stores/agentChatUiStore";

import { getStepScreen, getTour, getTourOwnedScreens } from "../constants/tourRegistry";
import type {
  TourCardAction,
  TourEnterAction,
  TourId,
  TourScreen,
  TourStep,
  TourTab,
} from "../constants/tourTypes";

const TAB_NAMES: readonly string[] = [
  "Home",
  "Transactions",
  "Budgets",
  "Insights",
] satisfies TourTab[];

export function isTourTabName(name: string | undefined): name is TourTab {
  return name !== undefined && TAB_NAMES.includes(name);
}

/** Name of the focused screen (a tab or a pushed screen), or undefined before navigation is ready. */
export function getCurrentRouteName(): string | undefined {
  if (!navigationRef.isReady()) {
    return undefined;
  }
  return navigationRef.getCurrentRoute()?.name;
}

/** The focused main tab, or null when another screen (settings, a form, auth...) is on top. */
export function getFocusedTourTab(): TourTab | null {
  const name = getCurrentRouteName();
  return isTourTabName(name) ? name : null;
}

/**
 * Switches the main tab bar to `tab`, popping any screen stacked above it. `pop: true` matters:
 * without it React Navigation 7 PUSHES a second copy of the tabs when a screen is on top of them
 * (a fresh tab navigator: slow to mount, every screen's state reset, the old copy left underneath).
 */
export function navigateToTourTab(tab: TourTab): void {
  if (!navigationRef.isReady()) {
    return;
  }
  navigationRef.navigate("Main", {
    screen: "MainTabs",
    params: { screen: tab },
    pop: true,
  });
}

/** Opens the manual add form (what the add menu's pencil does). */
export function openManualAddFromTour(): void {
  if (navigationRef.isReady()) {
    navigationRef.navigate("Main", { screen: "ManualAddTransaction" });
  }
}

/** Opens Settings → Tours (the checklist's "Take a tour"). */
export function openToursSettings(): void {
  if (navigationRef.isReady()) {
    navigationRef.navigate("Main", { screen: "SettingsTours" });
  }
}

/** Compares this month with last month (what the Insights compare launcher opens by default). */
function openCompareFromTour(): void {
  if (!navigationRef.isReady()) {
    return;
  }
  const thisMonth = startOfMonth(new Date());
  const lastMonth = subMonths(thisMonth, 1);
  const param = (date: Date) => ({
    year: date.getFullYear(),
    monthIndex0: date.getMonth(),
    label: format(date, "MMM yyyy"),
  });
  navigationRef.navigate("Main", {
    screen: "InsightsMonthCompare",
    params: { monthA: param(thisMonth), monthB: param(lastMonth) },
  });
}

/**
 * What a "Do" step's card button does for the user: the same as tapping the glowing target. The
 * add menu's two are built in; the rest run a command the owning screen registered (and that runs
 * the same handler a tap would, so the same tour event follows).
 */
export function runTourCardAction(action: TourCardAction): void {
  const fab = useAddTransactionFabStore.getState();
  if (action === "openFab") {
    fab.setFabOpen(true);
    return;
  }
  if (action === "openManualAdd") {
    fab.setFabOpen(false);
    openManualAddFromTour();
    return;
  }
  runTourCommand(action);
}

const ENTER_ACTIONS: Record<TourEnterAction, () => void> = {
  closeFab: () => useAddTransactionFabStore.getState().setFabOpen(false),
  openFab: () => useAddTransactionFabStore.getState().setFabOpen(true),
  openAgent: () => useAgentChatUiStore.getState().open(),
  closeAgent: () => useAgentChatUiStore.getState().close(),
  openCompare: openCompareFromTour,
};

export function runTourEnterActions(actions: readonly TourEnterAction[]): void {
  actions.forEach((action) => ENTER_ACTIONS[action]());
}

/** Whether `screen` is one of the main tabs (the tour can switch to those itself). */
export function isTabScreen(screen: TourScreen | undefined): screen is TourTab {
  return isTourTabName(screen);
}

/**
 * When a tour ends: closes the screens the tour pushed (a sample transaction's details, a
 * filtered list, the compare screen, a recurring item) and returns to the tour's tab. Nothing
 * happens when the user is somewhere the tour does not own (Settings): they stay there.
 */
export function popTourScreens(tourId: TourId): void {
  const current = getCurrentRouteName();
  if (current === undefined || isTourTabName(current)) {
    return;
  }
  if (!getTourOwnedScreens(tourId).has(current as TourScreen)) {
    return;
  }
  navigateToTourTab(getTour(tourId).tab ?? "Home");
}

/**
 * Puts the app in the state a step expects: the right tab (popping any screen above it), then the
 * step's own actions (open / close the add menu or the agent). Safe to run more than once. A step
 * on a pushed screen (a transaction's details...) is reached by the user's tap on the step before
 * it, so only a tab is navigated to here.
 */
export function runTourStepEnter(tourId: TourId, step: TourStep): void {
  const screen = getStepScreen(tourId, step);
  if (isTabScreen(screen) && getFocusedTourTab() !== screen) {
    navigateToTourTab(screen);
  }
  if (step.enter) {
    runTourEnterActions(step.enter);
  }
}
