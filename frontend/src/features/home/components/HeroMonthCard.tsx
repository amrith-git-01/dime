import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { SpendSplitBar } from "@/components/shared";
import { SkeletonBlock } from "@/components/ui";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { tourTargetIds } from "@/constants/tourTargetIds";
import { useTourTarget } from "@/hooks/useTourTarget";
import { createThemedStyles } from "@/theme";

type HeroMonthCardProps = {
  monthLabel: string;
  /** Month spent — leftover and % used live in the subtitle when a budget exists. */
  heroAmount: string;
  hasBudget: boolean;
  /** "₹1.2k left of ₹5k" compact remaining/total. Empty when no budget. */
  subtext: string;
  progress: number;
  /** Monthly budget (rupees); 0 when none is set. The bar is the budget when there is one. */
  budgetAmount?: number;
  /** Recurring / flexible spend (rupees) for the bar; hidden when there is no budget and no recurring spend. */
  fixedSpent?: number;
  flexibleSpent?: number;
  isLoading?: boolean;
  onAddBudget: () => void;
};

export const HeroMonthCard = memo(function HeroMonthCard({
  monthLabel,
  heroAmount,
  hasBudget,
  subtext,
  progress,
  budgetAmount = 0,
  fixedSpent = 0,
  flexibleSpent = 0,
  isLoading = false,
  onAddBudget,
}: HeroMonthCardProps) {
  const styles = useStyles();
  const tourTarget = useTourTarget(tourTargetIds.homeMonthCard);
  return (
    <View {...tourTarget} style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>THIS MONTH</Text>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
      </View>

      {/* Hero amount: what was spent, with a quiet "spent" label */}
      {isLoading ? (
        <SkeletonBlock style={styles.heroSkeleton} />
      ) : (
        <View style={styles.heroRow}>
          <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
            {heroAmount}
          </Text>
          <Text style={styles.heroSuffix}>spent</Text>
        </View>
      )}

      {!isLoading ? (
        <SpendSplitBar
          fixed={fixedSpent}
          flexible={flexibleSpent}
          budget={hasBudget ? budgetAmount : 0}
        />
      ) : null}

      {/* Meta line */}
      {isLoading ? (
        <SkeletonBlock style={styles.subtextSkeleton} />
      ) : hasBudget ? (
        <Text style={[styles.statusLine, progress >= 1 ? styles.statusLineOver : null]}>
          {subtext}
          <Text style={styles.statusLineMuted}>
            {" "}
            · {Math.round(progress * 100)}% used
          </Text>
        </Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={onAddBudget}
          hitSlop={4}
        >
          <Text style={styles.ctaLine}>Set a budget ›</Text>
        </Pressable>
      )}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    ...shadows.cardElevated,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: colors.inkFaint,
  },
  monthLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    marginTop: 4,
  },
  heroAmount: {
    flexShrink: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.8,
    color: colors.accentText,
    fontVariant: ["tabular-nums"],
  },
  heroSuffix: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  heroSkeleton: {
    height: 48,
    width: "65%",
    borderRadius: 6,
    marginTop: 4,
  },
  statusLine: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  statusLineMuted: {
    color: colors.inkFaint,
  },
  statusLineOver: {
    color: colors.danger,
  },
  ctaLine: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  subtextSkeleton: {
    height: 14,
    width: "50%",
    borderRadius: 4,
  },
}));
