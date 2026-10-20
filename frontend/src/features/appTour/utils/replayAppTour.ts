import { useAppTourStore } from "../store/appTourStore";

import { navigateToTourTab } from "./tourNavigation";

/** Settings "Show app tour": back to Home, then run the tour again (even if already seen), without celebrations. */
export function replayAppTour(): void {
  navigateToTourTab("Home");
  useAppTourStore.getState().start("replay");
}
