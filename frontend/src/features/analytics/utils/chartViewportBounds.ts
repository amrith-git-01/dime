import type { EdgeInsets } from "react-native-safe-area-context";

import { spacing } from "@/constants";

/** AppHeader inner content: paddingTop (lg) + row + paddingBottom (xl), excluding safe-area inset. */
const HEADER_BODY_HEIGHT = spacing.lg + 52 + spacing.xl;

const VISIBILITY_TOLERANCE_PX = 6;

/** Visible band for tab screens under AppHeader and above DimeTabBar. */
export function getMainTabChartViewportBounds(
  insets: EdgeInsets,
  windowHeight: number,
): { visibleTop: number; visibleBottom: number } {
  const visibleTop = insets.top + HEADER_BODY_HEIGHT;
  const visibleBottom =
    windowHeight - (spacing.tabBarHeight + Math.max(insets.bottom, spacing.sm));

  return { visibleTop, visibleBottom };
}

/**
 * Visible band for stack screens (native header, no tab bar).
 * Uses only the device safe-area insets — no custom header or tab bar to subtract.
 */
export function getStackChartViewportBounds(
  insets: EdgeInsets,
  windowHeight: number,
): { visibleTop: number; visibleBottom: number } {
  return {
    visibleTop: insets.top,
    visibleBottom: windowHeight - Math.max(insets.bottom, 0),
  };
}

export type ChartScreenContext = "tab" | "stack";

function getBoundsForContext(
  context: ChartScreenContext,
  insets: EdgeInsets,
  windowHeight: number,
): { visibleTop: number; visibleBottom: number } {
  return context === "stack"
    ? getStackChartViewportBounds(insets, windowHeight)
    : getMainTabChartViewportBounds(insets, windowHeight);
}

export function isChartFullyInViewport(
  y: number,
  height: number,
  insets: EdgeInsets,
  windowHeight: number,
  context: ChartScreenContext = "tab",
): boolean {
  const { visibleTop, visibleBottom } = getBoundsForContext(
    context,
    insets,
    windowHeight,
  );
  const bottom = y + height;

  return (
    y >= visibleTop - VISIBILITY_TOLERANCE_PX &&
    bottom <= visibleBottom + VISIBILITY_TOLERANCE_PX
  );
}

/** Donut cards are tall — trigger when the chart's vertical center enters the band. */
export function isChartCenterInViewport(
  y: number,
  height: number,
  insets: EdgeInsets,
  windowHeight: number,
  context: ChartScreenContext = "tab",
): boolean {
  const { visibleTop, visibleBottom } = getBoundsForContext(
    context,
    insets,
    windowHeight,
  );
  const centerY = y + height / 2;

  return centerY >= visibleTop && centerY <= visibleBottom;
}
