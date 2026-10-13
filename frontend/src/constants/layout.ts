import { spacing } from "./spacing";

/** Reusable layout presets (spread into StyleSheet rules). */
export const layout = {
  screenContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
} as const;
