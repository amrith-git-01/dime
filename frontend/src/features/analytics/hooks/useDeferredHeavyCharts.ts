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
 *   Charts stay mounted on blur; `focusGeneration` remounts them on return.
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
      setFocusGeneration((generation) => generation + 1);
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
