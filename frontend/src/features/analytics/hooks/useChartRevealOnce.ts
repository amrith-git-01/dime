import { useEffect, useRef, useState } from "react";

/** Survives tab blur and component remounts (e.g. skeleton → chart). Clears on app restart. */
const sessionPlayedChartIdentities = new Set<string>();

type UseChartRevealOnceOptions = {
  identity: string;
  enabled: boolean;
  isVisible: boolean;
  /** Retained for callers; reveal is marked played when it starts, not after this delay. */
  completeAfterMs: number;
  /** Arm the chart at its zero/baseline state before reveal starts. */
  onArm?: () => void;
  /** Run the reveal transition (Victory phase flip, Reanimated timing, etc.). */
  onStartReveal: () => void;
  /** Reset to baseline when identity changes or an in-progress reveal is interrupted. */
  onReset?: () => void;
};

/**
 * Viewport-gated "play once per identity" orchestration shared by chart entry hooks.
 */
export function useChartRevealOnce({
  identity,
  enabled,
  isVisible,
  completeAfterMs: _completeAfterMs,
  onArm,
  onStartReveal,
  onReset,
}: UseChartRevealOnceOptions): { hasPlayed: boolean } {
  const revealStartedRef = useRef(false);
  const onArmRef = useRef(onArm);
  const onStartRevealRef = useRef(onStartReveal);
  const onResetRef = useRef(onReset);
  const [, setPlayedTick] = useState(0);

  onArmRef.current = onArm;
  onStartRevealRef.current = onStartReveal;
  onResetRef.current = onReset;

  const hasPlayed = sessionPlayedChartIdentities.has(identity);

  useEffect(() => {
    revealStartedRef.current = false;
    if (sessionPlayedChartIdentities.has(identity)) {
      return;
    }
    onResetRef.current?.();
  }, [identity]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (sessionPlayedChartIdentities.has(identity)) {
      return;
    }

    if (!isVisible) {
      if (revealStartedRef.current) {
        revealStartedRef.current = false;
        onResetRef.current?.();
      }
      return;
    }

    if (revealStartedRef.current) {
      return;
    }

    revealStartedRef.current = true;
    sessionPlayedChartIdentities.add(identity);
    setPlayedTick((tick) => tick + 1);
    onArmRef.current?.();

    let outerFrame = 0;
    let innerFrame = 0;

    outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        onStartRevealRef.current();
      });
    });

    return () => {
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    };
  }, [enabled, identity, isVisible]);

  return { hasPlayed };
}

/** Test-only helper to reset session reveal state. */
export function resetChartRevealSessionForTests(): void {
  sessionPlayedChartIdentities.clear();
}

export function hasChartRevealPlayed(identity: string): boolean {
  return sessionPlayedChartIdentities.has(identity);
}
