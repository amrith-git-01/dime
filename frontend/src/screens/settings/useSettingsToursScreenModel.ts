import { useCallback, useEffect, useState } from "react";

import {
  buildTourRows,
  launchTour,
  useTourProgress,
  type TourId,
} from "@/features/appTour";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import {
  getTourMasterShineSeen,
  setTourMasterShineSeen,
} from "@/lib/onboarding/appTourStorage";

/** Settings → Tours: every tour with whether it was seen, the overall progress, and Play. */
export function useSettingsToursScreenModel() {
  const { userId } = useSessionUserId();
  const { seen, seenCount, total, allDone } = useTourProgress();

  // The Tour master badge shines the first time it is seen, then never again.
  const [masterShine] = useState(
    () => allDone && userId !== undefined && !getTourMasterShineSeen(userId),
  );
  useEffect(() => {
    if (allDone && userId !== undefined) {
      setTourMasterShineSeen(userId);
    }
  }, [allDone, userId]);

  const rows = buildTourRows(seen);

  const onPlay = useCallback((id: string) => {
    launchTour(id as TourId);
  }, []);

  return {
    intro: "Short, hands-on walkthroughs of each part of Dime. Replay any of them whenever you like.",
    rows,
    seenCount,
    total,
    allDone,
    masterShine,
    onPlay,
  };
}
