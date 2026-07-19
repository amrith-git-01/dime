import { useCallback, useRef, useState } from "react";

/**
 * Tracks in-flight Lottie toggle animations and latches footer disabled
 * flags so Clear/Save don't flip until all animations finish.
 */
export function useSettingsToggleBusyGate() {
  const [busyCount, setBusyCount] = useState(0);
  const busy = busyCount > 0;

  const onAnimationBusyChange = useCallback((nextBusy: boolean) => {
    setBusyCount((count) => Math.max(0, count + (nextBusy ? 1 : -1)));
  }, []);

  const latchedSaveDisabled = useRef(true);
  const latchedClearDisabled = useRef(true);

  const deferDisabled = (liveDisabled: boolean, kind: "save" | "clear") => {
    const latched =
      kind === "save" ? latchedSaveDisabled : latchedClearDisabled;
    if (!busy) {
      latched.current = liveDisabled;
      return liveDisabled;
    }
    return latched.current;
  };

  return {
    busy,
    onAnimationBusyChange,
    deferDisabled,
  };
}
