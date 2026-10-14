import { useEffect, useRef } from "react";
import type { View } from "react-native";

import { registerTourTarget } from "@/lib/tour/tourTargetRegistry";

/**
 * Marks an element as a guided-tour target. Spread the result on the host element:
 *
 *   const tour = useTourTarget(tourTargetIds.addFab);
 *   <Pressable {...tour} ... />
 *
 * Use it instead of the `<TourTarget>` wrapper when an extra wrapping view would change layout
 * (absolute-positioned buttons, row children).
 */
export function useTourTarget(id: string) {
  const ref = useRef<View>(null);

  useEffect(() => registerTourTarget(id, ref), [id]);

  // `collapsable: false` keeps the native view alive on Android so it can be measured.
  return { ref, collapsable: false } as const;
}
