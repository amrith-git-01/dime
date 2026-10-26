import { spacing } from "./spacing";

/**
 * Bottom space a scrolling tab screen keeps so its last content can scroll clear of the floating
 * buttons (the Ask AI button and the "?" above it, which sit over the bottom-right of the tab).
 */
export const FLOATING_BUTTONS_CLEARANCE = 140;

/** Height of the "Arrange" button row at the end of Home, Budgets and Insights. */
export const ARRANGE_ROW_HEIGHT = 44;

/**
 * Bottom space for Home, Budgets and Insights, whose last item is the centred Arrange row: the last
 * card stays exactly where the full clearance put it, and Arrange only has to clear the "+" bubble.
 */
export const ARRANGE_SCREEN_BOTTOM_CLEARANCE =
  FLOATING_BUTTONS_CLEARANCE - (ARRANGE_ROW_HEIGHT + spacing.xl);

/** Reusable layout presets (spread into StyleSheet rules). */
export const layout = {
  screenContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
} as const;
