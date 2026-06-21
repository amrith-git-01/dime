import { useCallback, useEffect, useRef } from "react";
import {
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import type { ChartPathAnimationConfig } from "@/features/analytics/constants/chartAnimation";
import {
  hasChartRevealPlayed,
  useChartRevealOnce,
} from "@/features/analytics/hooks/useChartRevealOnce";
import { chartAnimationTiming } from "@/features/analytics/utils/chartAnimationTiming";

/**
 * UI-thread clockwise donut reveal. Victory `Pie.Slice` + `animate` cannot
 * interpolate arc paths (Skia snaps), so slice sweeps are driven here instead.
 *
 * Bug guard (same as useVictoryChartEntry): `useChartRevealOnce` marks the
 * identity as played the moment the reveal starts, causing a re-render where
 * `hasPlayed=true` lands BEFORE the double-rAF fires `startReveal`. The old
 * `useEffect([hasPlayed]) → progress.value = 1` snapped the donut to fully
 * revealed before `withTiming` could play the sweep.
 *
 * Fix: use `wasCompletedRef` (captures pre-mount state) to distinguish return
 * visits (snap immediately) from first plays (let withTiming sweep).
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

  // Tracks whether this identity had already COMPLETED before this render.
  // Updated synchronously on identity change so first render uses correct state.
  const prevIdentityRef = useRef(identity);
  const wasCompletedRef = useRef(hasChartRevealPlayed(identity));
  if (prevIdentityRef.current !== identity) {
    prevIdentityRef.current = identity;
    wasCompletedRef.current = hasChartRevealPlayed(identity);
  }

  const resetProgress = useCallback(() => {
    if (hasChartRevealPlayed(identity)) {
      return;
    }
    progress.value = 0;
  }, [identity, progress]);

  const startReveal = useCallback(() => {
    progress.value = withTiming(1, timing);
  }, [progress, timing]);

  const { hasPlayed: _hasPlayed } = useChartRevealOnce({
    identity,
    enabled,
    isVisible,
    completeAfterMs: timing.duration,
    onStartReveal: startReveal,
    onReset: resetProgress,
  });

  // On identity change: snap to 1 for return visits, reset to 0 for new ones.
  // NOT dependent on `hasPlayed` to avoid snapping during the animation window
  // between the reveal-start re-render and the actual withTiming call.
  useEffect(() => {
    if (wasCompletedRef.current) {
      progress.value = 1;
    } else {
      progress.value = 0;
    }
  }, [identity, progress]);

  return progress;
}
