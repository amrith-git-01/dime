import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useInsightsScrollVisibility } from "@/features/analytics/hooks/useInsightsScrollVisibility";
import {
  isChartCenterInViewport,
  isChartFullyInViewport,
  type ChartScreenContext,
} from "@/features/analytics/utils/chartViewportBounds";

export type ChartViewportMode = "full" | "center";

/**
 * True when the chart is in the viewport band.
 * Use `context="stack"` on stack-navigator screens (no tab bar, native header).
 */
export function useChartInViewport(
  mode: ChartViewportMode = "full",
  context: ChartScreenContext = "tab",
) {
  const containerRef = useRef<View>(null);
  const [isFullyVisible, setIsFullyVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { scrollGeneration } = useInsightsScrollVisibility();

  const measureVisibility = useCallback(() => {
    if (!isFocused) {
      setIsFullyVisible(false);
      return;
    }

    containerRef.current?.measureInWindow((_x, y, _width, height) => {
      if (height <= 0) {
        setIsFullyVisible(false);
        return;
      }

      const windowHeight = Dimensions.get("window").height;
      const isVisible =
        mode === "center"
          ? isChartCenterInViewport(y, height, insets, windowHeight, context)
          : isChartFullyInViewport(y, height, insets, windowHeight, context);
      setIsFullyVisible(isVisible);
    });
  }, [context, insets, isFocused, mode]);

  const onChartLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      measureVisibility();
    },
    [measureVisibility],
  );

  useEffect(() => {
    measureVisibility();
  }, [measureVisibility, scrollGeneration]);

  return {
    containerRef,
    onChartLayout,
    isFullyVisible,
  };
}
