import { tourIdForTab } from "../constants/tourRegistry";
import type { TourId, TourTab } from "../constants/tourTypes";

/**
 * Whether the floating "?" button shows, and which tour it opens. It shows on a main tab until
 * that tab's tour has been watched or skipped, and not before the first-run tour has had its turn
 * (it starts by itself for a new user). `seen` is what the button should believe: while a tour
 * runs the caller keeps it as it was when the tour started, so the button folds away after it.
 */
export function resolveTourHelpFab(input: {
  /** The focused main tab, or null when another screen is on top. */
  tab: TourTab | null;
  seen: ReadonlySet<TourId>;
}): { show: boolean; tourId: TourId | null } {
  if (input.tab === null) {
    return { show: false, tourId: null };
  }
  const tourId = tourIdForTab(input.tab);
  const show = input.seen.has("firstExpense") && !input.seen.has(tourId);
  return { show, tourId };
}
