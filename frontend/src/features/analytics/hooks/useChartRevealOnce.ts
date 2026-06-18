import { useEffect, useRef, useState } from "react";

type UseChartRevealOnceOptions = {
  identity: string;
  enabled: boolean;
  isVisible: boolean;
  completeAfterMs: number;
  /** Arm the chart at its zero/baseline state before reveal starts. */
  onArm?: () => void;
  /** Run the reveal transition (Victory phase flip, Reanimated timing, etc.). */
  onStartReveal: () => void;
  /** Reset to baseline when identity changes or the chart leaves the viewport. */
  onReset?: () => void;
};

/**
 * Viewport-gated "play once per identity" orchestration shared by chart entry hooks.
 */
export function useChartRevealOnce({
  identity,
  enabled,
  isVisible,
  completeAfterMs,
  onArm,
  onStartReveal,
  onReset,
}: UseChartRevealOnceOptions): { hasPlayed: boolean } {
  const playedRef = useRef(new Set<string>());
  const revealStartedRef = useRef(false);
  const onArmRef = useRef(onArm);
  const onStartRevealRef = useRef(onStartReveal);
  const onResetRef = useRef(onReset);
  const [, setPlayedTick] = useState(0);

  onArmRef.current = onArm;
  onStartRevealRef.current = onStartReveal;
  onResetRef.current = onReset;

  const hasPlayed = playedRef.current.has(identity);

  useEffect(() => {
    revealStartedRef.current = false;
    if (playedRef.current.has(identity)) {
      return;
    }
    onResetRef.current?.();
  }, [identity]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (playedRef.current.has(identity)) {
      return;
    }

    if (!isVisible) {
      revealStartedRef.current = false;
      onResetRef.current?.();
      return;
    }

    if (revealStartedRef.current) {
      return;
    }

    revealStartedRef.current = true;
    onArmRef.current?.();

    let outerFrame = 0;
    let innerFrame = 0;
    let completeTimer: ReturnType<typeof setTimeout> | undefined;

    outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        onStartRevealRef.current();
        completeTimer = setTimeout(() => {
          playedRef.current.add(identity);
          setPlayedTick((tick) => tick + 1);
        }, completeAfterMs + 80);
      });
    });

    return () => {
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
      if (completeTimer != null) {
        clearTimeout(completeTimer);
      }
    };
  }, [completeAfterMs, enabled, identity, isVisible]);

  return { hasPlayed };
}
