import { useIsFocused } from "@react-navigation/native";
import { useEffect, useState } from "react";
import { InteractionManager } from "react-native";

type InsightsChartsPresentation = {
  chartsReady: boolean;
};

/**
 * Mounts Victory/Skia charts while Insights is focused.
 *
 * - Cached insights (MMKV): paint chart shell immediately — no skeleton flash.
 *   Charts stay mounted on blur so stack/tab return does not remount Victory.
 * - No cache: defer mount until idle and unmount on blur (placeholder while waiting).
 *
 * Entry animations are keyed separately via `useChartViewportAnimation`.
 */
export function useDeferredHeavyCharts(
  hasCachedInsights: boolean,
): InsightsChartsPresentation {
  const isFocused = useIsFocused();
  const [chartsReady, setChartsReady] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      if (!hasCachedInsights) {
        setChartsReady(false);
      }
      return;
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

  return { chartsReady };
}
