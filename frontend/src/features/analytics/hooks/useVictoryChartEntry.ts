import { useCallback, useEffect, useState } from "react";

import type { ChartPathAnimationConfig } from "@/features/analytics/constants/chartAnimation";
import { useChartRevealOnce } from "@/features/analytics/hooks/useChartRevealOnce";
import { chartAnimationTiming } from "@/features/analytics/utils/chartAnimationTiming";

type Phase = "zero" | "target";

/**
 * Victory Native XL animates paths when they *change*, not on first mount.
 * Keep `animate` set through the zero → target transition; only clear after it finishes.
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

  useEffect(() => {
    if (hasPlayed) {
      setPhase("target");
      setEntryAnimate(undefined);
    }
  }, [hasPlayed]);

  useEffect(() => {
    if (!hasPlayed) {
      armZeroBaseline();
    }
  }, [animateConfig, armZeroBaseline, hasPlayed, identity]);

  if (!enabled) {
    return { data: zeroData, animate: undefined };
  }

  if (hasPlayed) {
    return { data: targetData, animate: undefined };
  }

  return {
    data: phase === "target" ? targetData : zeroData,
    animate: entryAnimate,
  };
}
