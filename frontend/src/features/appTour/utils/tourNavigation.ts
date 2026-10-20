import { navigationRef } from "@/navigation/navigationRef";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";

import type {
  TourCardAction,
  TourEnterAction,
  TourStep,
  TourTab,
} from "../constants/tourSteps";

const TAB_NAMES: readonly string[] = [
  "Home",
  "Transactions",
  "Budgets",
  "Insights",
] satisfies TourTab[];

export function isTourTabName(name: string | undefined): name is TourTab {
  return name !== undefined && TAB_NAMES.includes(name);
}

/** The focused main tab, or null when another screen (settings, a form, auth...) is on top. */
export function getFocusedTourTab(): TourTab | null {
  if (!navigationRef.isReady()) {
    return null;
  }
  const name = navigationRef.getCurrentRoute()?.name;
  return isTourTabName(name) ? name : null;
}

/** Switches the main tab bar to `tab`, popping any screen stacked above it. */
export function navigateToTourTab(tab: TourTab): void {
  if (!navigationRef.isReady()) {
    return;
  }
  navigationRef.navigate("Main", {
    screen: "MainTabs",
    params: { screen: tab },
  });
}

/** Opens the manual add form (what the add menu's pencil does). */
export function openManualAddFromTour(): void {
  if (navigationRef.isReady()) {
    navigationRef.navigate("Main", { screen: "ManualAddTransaction" });
  }
}

/**
 * What a step's card button does for the user: the same as tapping the glowing target (open the
 * add menu, or the pencil: close the menu and open the manual add form).
 */
export function runTourCardAction(action: TourCardAction): void {
  const fab = useAddTransactionFabStore.getState();
  if (action === "openFab") {
    fab.setFabOpen(true);
    return;
  }
  fab.setFabOpen(false);
  openManualAddFromTour();
}

const ENTER_ACTIONS: Record<TourEnterAction, () => void> = {
  closeFab: () => useAddTransactionFabStore.getState().setFabOpen(false),
  openFab: () => useAddTransactionFabStore.getState().setFabOpen(true),
};

/**
 * Puts the app in the state a step expects: the right tab, then the step's own actions
 * (open / close the add menu). Safe to run more than once.
 */
export function runTourStepEnter(step: TourStep): void {
  if (step.tab && getFocusedTourTab() !== step.tab) {
    navigateToTourTab(step.tab);
  }
  step.enter?.forEach((action) => ENTER_ACTIONS[action]());
}
