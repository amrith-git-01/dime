import { useState } from "react";
import {
  runOnJS,
  useAnimatedReaction,
  type SharedValue,
} from "react-native-reanimated";

/**
 * Mirrors a quantized value derived from the scene clock into React state (a count-up, the
 * number of typed characters). `read` is a worklet; the state only changes when the quantized
 * value does, so a 1 s count-up is a few dozen renders of one small text, not per-frame work.
 */
export function useClockValue(
  clock: SharedValue<number>,
  read: (ms: number) => number,
  initialMs: number,
): number {
  const [value, setValue] = useState(() => read(initialMs));

  useAnimatedReaction(
    () => read(clock.value),
    (current, previous) => {
      // The first run is skipped: a scene mounts while the clock may still hold the previous
      // scene's end (it is reset right after), and the initial state is already correct.
      if (previous !== null && current !== previous) {
        runOnJS(setValue)(current);
      }
    },
  );

  return value;
}
