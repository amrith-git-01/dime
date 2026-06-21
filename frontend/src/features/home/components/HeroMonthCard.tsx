import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ProgressBar, SkeletonBlock } from "@/components/ui";
import {
  accent,
  ink,
  inkFaint,
  inkSoft,
  surface,
  surfaceSunken,
} from "@/constants/colors";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { shadows } from "@/constants/shadows";
import { spacing } from "@/constants/spacing";

type HeroMonthCardProps = {
  monthLabel: string;
  /** Remaining budget (if set) or spent amount (if no budget). */
  heroAmount: string;
  /** True if heroAmount represents remaining budget; false = spent. */
  hasBudget: boolean;
  /** "₹1.2k / ₹5k" compact remaining/total. Empty when no budget. */
  subtext: string;
  progress: number;
  isLoading?: boolean;
  onAddBudget: () => void;
};

export const HeroMonthCard = memo(function HeroMonthCard({
  monthLabel,
  heroAmount,
  hasBudget,
  subtext,
  progress,
  isLoading = false,
  onAddBudget,
}: HeroMonthCardProps) {
  return (
    <View style={styles.card}>
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
        <Pressable onPress={onAddBudget} hitSlop={4}>
          <Text style={styles.ctaLine}>spent this month · Set a budget ›</Text>
        </Pressable>
      )}

      {/* Progress bar */}
      {hasBudget && (
        <View style={styles.progressWrap}>
          <ProgressBar
            progress={isLoading ? 0 : progress}
            fillColor={accent}
            backgroundColor={surfaceSunken}
            height={5}
          />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: surface,
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
    color: inkFaint,
  },
  monthLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: inkSoft,
  },
  heroAmount: {
    fontFamily: fontFamilies.bold,
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.8,
    color: accent,
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
    color: inkSoft,
  },
  statusLineMuted: {
    color: inkFaint,
  },
  ctaLine: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: ink,
  },
  subtextSkeleton: {
    height: 14,
    width: "50%",
    borderRadius: 4,
  },
  progressWrap: {
    marginTop: spacing.xs,
  },
});
