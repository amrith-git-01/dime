import { useMemo, useSyncExternalStore } from "react";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import { subscribeTourSeen } from "@/lib/onboarding/appTourStorage";

import { TOUR_COUNT } from "../constants/tourRegistry";
import type { TourId, TourTab } from "../constants/tourTypes";
import { getSeenTourIds, haveAllToursBeenSeen } from "../utils/tourSeen";

import { useCurrentRouteName } from "./useTourPaused";
import { isTourTabName } from "../utils/tourNavigation";

export type TourProgress = {
  seen: ReadonlySet<TourId>;
  seenCount: number;
  total: number;
  allDone: boolean;
};

/**
 * Which tours this user has seen, kept current as tours are watched or skipped. Read through the
 * storage's own subscription (the snapshot is a plain string, so it is stable between renders):
 * a plain read would be memoised by the React Compiler and never notice a tour being seen.
 */
export function useTourProgress(): TourProgress {
  const { userId } = useSessionUserId();
  const snapshot = useSyncExternalStore(subscribeTourSeen, () =>
    getSeenTourIds(userId).join(","),
  );
  return useMemo(() => {
    const seen = new Set(
      snapshot === "" ? [] : (snapshot.split(",") as TourId[]),
    );
    return {
      seen,
      seenCount: seen.size,
      total: TOUR_COUNT,
      allDone: haveAllToursBeenSeen(seen),
    };
  }, [snapshot]);
}

/** The main tab on screen, or null while another screen (Settings, a form...) covers the tabs. */
export function useFocusedTourTab(): TourTab | null {
  const name = useCurrentRouteName();
  return isTourTabName(name) ? name : null;
}


