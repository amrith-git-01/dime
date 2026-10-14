import { navigationRef } from "@/navigation/navigationRef";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";

import type { TourEnterAction, TourStep, TourTab } from "../constants/tourSteps";

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
export function navigateToTourTab(
  tab: TourTab,
  budgetsRecurringKind?: "income" | "subscription",
): void {
  if (!navigationRef.isReady()) {
    return;
  }
  if (tab === "Budgets") {
    navigationRef.navigate("Main", {
      screen: "MainTabs",
      params: {
        screen: "Budgets",
        params: budgetsRecurringKind
          ? { recurringKind: budgetsRecurringKind }
          : undefined,
      },
    });
    return;
  }
  navigationRef.navigate("Main", {
    screen: "MainTabs",
    params: { screen: tab },
  });
}

/** Opens the manual add form (the finale's call to action). */
export function openManualAddFromTour(): void {
  if (navigationRef.isReady()) {
    navigationRef.navigate("Main", { screen: "ManualAddTransaction" });
  }
}

const ENTER_ACTIONS: Record<TourEnterAction, () => void> = {
  closeFab: () => useAddTransactionFabStore.getState().setFabOpen(false),
  openFab: () => useAddTransactionFabStore.getState().setFabOpen(true),
  scrollToRecurring: () => navigateToTourTab("Budgets", "subscription"),
};

/**
 * Puts the app in the state a step expects: the right tab, then the step's own actions
 * (open / close the add menu, scroll a list). Safe to run more than once.
 */
export function runTourStepEnter(step: TourStep): void {
  const hasScrollAction = step.enter?.includes("scrollToRecurring") ?? false;
  if (step.tab && !hasScrollAction && getFocusedTourTab() !== step.tab) {
    navigateToTourTab(step.tab);
  }
  step.enter?.forEach((action) => ENTER_ACTIONS[action]());
}
