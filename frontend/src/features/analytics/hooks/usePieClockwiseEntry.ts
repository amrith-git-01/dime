import { useCallback, useEffect } from "react";
import {
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import type { ChartPathAnimationConfig } from "@/features/analytics/constants/chartAnimation";
import { useChartRevealOnce } from "@/features/analytics/hooks/useChartRevealOnce";
import { chartAnimationTiming } from "@/features/analytics/utils/chartAnimationTiming";

/**
 * UI-thread clockwise donut reveal. Victory `Pie.Slice` + `animate` cannot
 * interpolate arc paths (Skia snaps), so slice sweeps are driven here instead.
 */
export function usePieClockwiseEntry({
  identity,
  enabled,
  isVisible,
  animateConfig,
}: {
  identity: string;
  enabled: boolean;
  isVisible: boolean;
  animateConfig: ChartPathAnimationConfig;
}): SharedValue<number> {
  const timing = chartAnimationTiming(animateConfig, 800);
  const progress = useSharedValue(0);

  const resetProgress = useCallback(() => {
    progress.value = 0;
  }, [progress]);

  const startReveal = useCallback(() => {
    progress.value = withTiming(1, timing);
  }, [progress, timing]);

  const { hasPlayed } = useChartRevealOnce({
    identity,
    enabled,
    isVisible,
    completeAfterMs: timing.duration,
    onStartReveal: startReveal,
    onReset: resetProgress,
  });

  useEffect(() => {
    progress.value = hasPlayed ? 1 : 0;
  }, [hasPlayed, identity, progress]);

  return progress;
}
