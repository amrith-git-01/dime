import type { TourId } from "../constants/tourTypes";

/**
 * Whether the Ask AI entry button is hidden because a tour runs. It is hidden for every tour but
 * Ask AI (whose panel is the stage): on Android its elevation otherwise draws it over the tour's
 * dim layer, even above the overlay's own zIndex and elevation.
 */
export function isAgentEntryFabHiddenByTour(active: boolean, tourId: TourId): boolean {
  return active && tourId !== "askAi";
}
