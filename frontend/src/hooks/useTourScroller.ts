import { useCallback, useEffect, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

import {
  registerTourScroller,
  type TourScrollKey,
} from "@/lib/tour/tourScrollRegistry";

/**
 * Lets the guided tour scroll this screen's list so a spotlighted element is in view. Pass how to
 * scroll it and attach the returned `onScroll` (call it from your own handler if you have one):
 *
 *   const { onScroll } = useTourScroller("home", (y, animated) =>
 *     scrollRef.current?.scrollTo({ y, animated }));
 */
export function useTourScroller(
  key: TourScrollKey,
  scrollTo: (offset: number, animated: boolean) => void,
) {
  const offsetRef = useRef(0);
  const scrollToRef = useRef(scrollTo);
  useEffect(() => {
    scrollToRef.current = scrollTo;
  });

  useEffect(
    () =>
      registerTourScroller(key, {
        scrollTo: (offset, animated) => scrollToRef.current(offset, animated),
        getOffset: () => offsetRef.current,
      }),
    [key],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetRef.current = event.nativeEvent.contentOffset.y;
    },
    [],
  );
  return { onScroll };
}
