import {
  getAppTourCompleted,
  getTabTourSeen,
  setAppTourCompleted,
  setTabTourSeen,
} from "@/lib/onboarding/appTourStorage";

import { TOUR_ORDER } from "../constants/tourRegistry";
import type { TourId } from "../constants/tourTypes";

/**
 * True once the user has watched or skipped this tour (and for a signed-out user, so nothing
 * ever starts for them). The first-expense tour keeps its original storage key.
 */
export function isTourSeen(id: TourId, userId: string | undefined): boolean {
  if (userId === undefined) {
    return true;
  }
  return id === "firstExpense"
    ? getAppTourCompleted(userId)
    : getTabTourSeen(id, userId);
}

export function markTourSeen(id: TourId, userId: string | undefined): void {
  if (userId === undefined) {
    return;
  }
  if (id === "firstExpense") {
    setAppTourCompleted(userId);
  } else {
    setTabTourSeen(id, userId);
  }
}

/** The tours this user has seen, in listing order. Empty for a signed-out user's perspective of "none". */
export function getSeenTourIds(userId: string | undefined): TourId[] {
  if (userId === undefined) {
    return [];
  }
  return TOUR_ORDER.filter((id) => isTourSeen(id, userId));
}

/** True when every tour has been seen. */
export function haveAllToursBeenSeen(seen: ReadonlySet<TourId>): boolean {
  return TOUR_ORDER.every((id) => seen.has(id));
}

/**
 * The tour to offer after `current`: the next unseen one in listing order, wrapping round to the
 * start; null when everything is seen.
 */
export function pickNextUnseenTour(
  seen: ReadonlySet<TourId>,
  current: TourId,
): TourId | null {
  const start = TOUR_ORDER.indexOf(current);
  for (let offset = 1; offset <= TOUR_ORDER.length; offset += 1) {
    const candidate = TOUR_ORDER[(start + offset) % TOUR_ORDER.length];
    if (candidate !== current && !seen.has(candidate)) {
      return candidate;
    }
  }
  return null;
}
