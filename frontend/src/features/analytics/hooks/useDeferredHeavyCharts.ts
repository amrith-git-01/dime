import { useIsFocused } from "@react-navigation/native";
import { useEffect, useRef, useState } from "react";
import { InteractionManager } from "react-native";

type InsightsChartsPresentation = {
  chartsReady: boolean;
  /** Bumps on each Insights tab focus — remount Victory charts for entry animation. */
  focusGeneration: number;
};

/**
 * Mounts Victory/Skia charts while Insights is focused.
 *
 * - Cached insights (MMKV): paint chart shell immediately — no skeleton flash.
 *   Charts stay mounted on blur; `focusGeneration` bumps only on first paint (not stack/tab return).
 * - No cache: defer mount until idle and unmount on blur (placeholder while waiting).
 */
export function useDeferredHeavyCharts(
  hasCachedInsights: boolean,
): InsightsChartsPresentation {
  const isFocused = useIsFocused();
  const [chartsReady, setChartsReady] = useState(false);
  const [focusGeneration, setFocusGeneration] = useState(0);
  const wasFocusedRef = useRef(false);

  useEffect(() => {
    if (!isFocused) {
      wasFocusedRef.current = false;
      if (!hasCachedInsights) {
        setChartsReady(false);
      }
      return;
    }

    if (!wasFocusedRef.current) {
      wasFocusedRef.current = true;
      // Bump only while charts are still off-screen (first paint). Returning from a
      // stack screen or tab keeps chartsReady true — remounting replays Victory pie
      // slice grow from center and briefly fills the donut hole.
      if (!chartsReady) {
        setFocusGeneration((generation) => generation + 1);
      }
    }

    if (hasCachedInsights) {
      setChartsReady(true);
      return;
    }

    let cancelled = false;

    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          setChartsReady(true);
        }
      });
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [hasCachedInsights, isFocused]);

  return { chartsReady, focusGeneration };
}
