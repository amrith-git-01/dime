import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { ProgressBar, SkeletonBlock } from "@/components/ui";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { tourTargetIds } from "@/constants/tourTargetIds";
import { useTourTarget } from "@/hooks/useTourTarget";
import { createThemedStyles, useTheme } from "@/theme";

type HeroMonthCardProps = {
  monthLabel: string;
  /** Month spent — leftover and % used live in the subtitle when a budget exists. */
  heroAmount: string;
  hasBudget: boolean;
  /** "₹1.2k / ₹5k" compact remaining/total. Empty when no budget. */
  subtext: string;
  progress: number;
  /** "Fixed ₹X · Flexible ₹Y"; omitted when none of the spend is fixed. */
  splitLine?: string | null;
  isLoading?: boolean;
  onAddBudget: () => void;
};

export const HeroMonthCard = memo(function HeroMonthCard({
  monthLabel,
  heroAmount,
  hasBudget,
  subtext,
  progress,
  splitLine,
  isLoading = false,
  onAddBudget,
}: HeroMonthCardProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const tourTarget = useTourTarget(tourTargetIds.homeMonthCard);
  return (
    <View {...tourTarget} style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>THIS MONTH</Text>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
      </View>

      {/* Hero amount */}
      {isLoading ? (
        <SkeletonBlock style={styles.heroSkeleton} />
      ) : (
        <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
          {heroAmount}
        </Text>
      )}

      {!isLoading && splitLine ? (
        <Text style={styles.splitLine}>{splitLine}</Text>
      ) : null}

      {/* Status line */}
      {isLoading ? (
        <SkeletonBlock style={styles.subtextSkeleton} />
      ) : hasBudget ? (
        <Text style={styles.statusLine}>
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

      {/* Progress bar */}
      {hasBudget && (
        <View style={styles.progressWrap}>
          <ProgressBar
            progress={isLoading ? 0 : progress}
            fillColor={colors.accent}
            backgroundColor={colors.surfaceSunken}
            height={5}
          />
        </View>
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
  heroAmount: {
    fontFamily: fontFamilies.bold,
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.8,
    color: colors.accentText,
    fontVariant: ["tabular-nums"],
    marginTop: 4,
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
  splitLine: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
  },
  statusLineMuted: {
    color: colors.inkFaint,
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
  progressWrap: {
    marginTop: spacing.xs,
  },
}));
