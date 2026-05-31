import { colors } from "./colors";
import { radius } from "./radius";
import { spacing } from "./spacing";

/** Reusable layout presets (spread into StyleSheet rules). */
export const layout = {
  screenContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  card: {
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardCompact: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroCard: {
    borderRadius: radius.hero,
    padding: spacing.xl,
    backgroundColor: colors.headerGradientStart,
    borderWidth: 1,
    borderColor: colors.headerGradientEnd,
  },
} as const;
