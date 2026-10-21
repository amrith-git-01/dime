import { spacing } from "./spacing";

/**
 * Bottom space a scrolling tab screen keeps so its last content can scroll clear of the floating
 * buttons (the Ask AI button and the "?" above it, which sit over the bottom-right of the tab).
 */
export const FLOATING_BUTTONS_CLEARANCE = 140;

/** Reusable layout presets (spread into StyleSheet rules). */
export const layout = {
  screenContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
} as const;
