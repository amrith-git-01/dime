import { useCallback, useEffect, useRef, useState } from "react";

import type { ChartPathAnimationConfig } from "@/features/analytics/constants/chartAnimation";
import {
  hasChartRevealPlayed,
  useChartRevealOnce,
} from "@/features/analytics/hooks/useChartRevealOnce";
import { chartAnimationTiming } from "@/features/analytics/utils/chartAnimationTiming";

type Phase = "zero" | "target";

/**
 * Victory Native XL animates paths when they *change*, not on first mount.
 * Keep `animate` set through the zero → target transition; only clear after it finishes.
 *
 * Bug guard: `useChartRevealOnce` marks an identity as "played" the instant the reveal
 * starts (so remounts mid-animation don't re-animate), but this causes `hasPlayed=true`
 * to appear in the SAME render cycle as the double-rAF that triggers the actual path
 * change. Using `hasPlayed` directly to gate the early-return would snap the chart to
 * its final state before Victory can animate.
 *
 * Fix: track whether the identity was ALREADY completed before this component instance
 * mounted. Only return finalState early for genuine return-visits; let the phase state
 * drive the zero → target transition for first plays.
 */
export function useVictoryChartEntry<T>({
  identity,
  zeroData,
  targetData,
  enabled,
  isFullyVisible,
  animateConfig,
}: {
  identity: string;
  zeroData: T;
  targetData: T;
  enabled: boolean;
  isFullyVisible: boolean;
  animateConfig: ChartPathAnimationConfig;
}): { data: T; animate?: ChartPathAnimationConfig } {
  const timing = chartAnimationTiming(animateConfig);
  const [phase, setPhase] = useState<Phase>("zero");
  const [entryAnimate, setEntryAnimate] = useState<
    ChartPathAnimationConfig | undefined
  >(animateConfig);

  // Tracks whether this identity had already COMPLETED before this render.
  // Updated synchronously when identity changes so it reflects the correct
  // pre-existing state on the very first render with the new identity.
  const prevIdentityRef = useRef(identity);
  const wasCompletedRef = useRef(hasChartRevealPlayed(identity));
  if (prevIdentityRef.current !== identity) {
    prevIdentityRef.current = identity;
    wasCompletedRef.current = hasChartRevealPlayed(identity);
  }

  const armZeroBaseline = useCallback(() => {
    setPhase("zero");
    setEntryAnimate(animateConfig);
  }, [animateConfig]);

  const startReveal = useCallback(() => {
    setPhase("target");
  }, []);

  const { hasPlayed } = useChartRevealOnce({
    identity,
    enabled,
    isVisible: isFullyVisible,
    completeAfterMs: timing.duration,
    onArm: armZeroBaseline,
    onStartReveal: startReveal,
    onReset: armZeroBaseline,
  });

  // Clear the animate prop after the animation has had time to complete so
  // Victory stops intercepting subsequent data changes.
  useEffect(() => {
    if (phase !== "target") return;
    const timer = setTimeout(
      () => setEntryAnimate(undefined),
      timing.duration + 50,
    );
    return () => clearTimeout(timer);
  }, [phase, timing.duration]);

  // Re-arm zero baseline whenever identity or animateConfig changes and
  // the new identity hasn't played yet.
  useEffect(() => {
    if (!hasPlayed) {
      armZeroBaseline();
    }
  }, [animateConfig, armZeroBaseline, hasPlayed, identity]);

  if (!enabled) {
    return { data: zeroData, animate: undefined };
  }

  // Return visit: identity was already completed before this instance mounted.
  // Skip entry animation and show final state immediately.
  if (wasCompletedRef.current) {
    return { data: targetData, animate: undefined };
  }

  return {
    data: phase === "target" ? targetData : zeroData,
    animate: entryAnimate,
  };
}
