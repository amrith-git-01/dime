import { useEffect, useRef } from "react";

import { registerTourRestorable } from "@/lib/tour/tourRestoreRegistry";

/**
 * Lets the guided tour put this screen's state back when it ends:
 *
 *   useTourRestorable("insights.month", {
 *     snapshot: () => selectedMonthIndex,
 *     restore: (index) => selectMonth(index as number),
 *   });
 *
 * The latest closures always run, so they can read current state.
 */
export function useTourRestorable(
  key: string,
  restorable: { snapshot: () => unknown; restore: (snapshot: unknown) => void },
): void {
  const latest = useRef(restorable);
  useEffect(() => {
    latest.current = restorable;
  });
  useEffect(
    () =>
      registerTourRestorable(key, {
        snapshot: () => latest.current.snapshot(),
        restore: (snapshot) => latest.current.restore(snapshot),
      }),
    [key],
  );
}
