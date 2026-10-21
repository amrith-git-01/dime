import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";

import { getTour } from "../constants/tourRegistry";
import type { TourId } from "../constants/tourTypes";
import { useAppTourStore, type AppTourStartedFrom } from "../store/appTourStore";

import { getFocusedTourTab, navigateToTourTab } from "./tourNavigation";

/**
 * Starts a tour from anywhere (a "?" button, Settings → Tours, "Up next"): goes to the tour's own
 * tab first, so it begins on the right screen (popping Settings or any pushed screen), then runs it.
 * A tour already running is left alone.
 */
export function launchTour(tourId: TourId, startedFrom?: AppTourStartedFrom): void {
  if (useAppTourStore.getState().active) {
    return;
  }
  // The user chose this tour: the first-run tour should not start by itself right after it.
  useAppTourStore.getState().suppressAutoStart();
  useAddTransactionFabStore.getState().setFabOpen(false);
  // A tour without a tab of its own (Ask AI) runs over the tab already on screen, or Home when
  // it is started from somewhere else (Settings).
  const tab = getTour(tourId).tab ?? getFocusedTourTab() ?? "Home";
  navigateToTourTab(tab);
  useAppTourStore.getState().start(tourId, startedFrom);
}
