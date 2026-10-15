import type { QueryClient } from "@tanstack/react-query";

import { useAppTourStore } from "../store/appTourStore";

import { navigateToTourTab } from "./tourNavigation";

/** Settings "Show app tour": back to Home, then run the tour again (even if already seen). */
export function replayAppTour(queryClient: QueryClient): void {
  navigateToTourTab("Home");
  useAppTourStore.getState().start(queryClient);
}
