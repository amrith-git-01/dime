import type { ReactNode } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { AnimatedProgressBar } from "@/components/ui/AnimatedProgressBar";
import { Spinner } from "@/components/ui/Spinner";
import { colors, hero, layout, spacing, typography } from "@/constants";

type HeroSummaryCardProps = {
  title: string;
  date: string;
  /** Renders in header row after optional `date` (e.g. month `SelectDropdown`). */
  headerRight?: ReactNode;
  amount: string;
  subtext: string;
  progress: number;
  progressLabel?: string;
  isAmountLoading?: boolean;
  amountSpinnerTone?: "white" | "primary";
  showProgress?: boolean;
  /** Passed to progress bar so fill animates once per key (e.g. per month). */
  progressAnimationKey?: string;
  actionLabel?: string;
  onAction?: (() => void) | null;
  amountAccessory?: ReactNode;
};

export function HeroSummaryCard({
  title,
  date,
  headerRight,
  amount,
  subtext,
  progress,
  progressLabel,
  isAmountLoading = false,
  amountSpinnerTone = "white",
  showProgress = true,
  progressAnimationKey,
  actionLabel,
  onAction = null,
  amountAccessory,
}: HeroSummaryCardProps) {
  const showHeaderTrailing = date.trim().length > 0 || headerRight != null;

  return (
    <View
      style={[styles.card, headerRight == null ? styles.cardClipOrbs : null]}
    >
      <View style={styles.orbTop} pointerEvents="none" />
      <View style={styles.orbBottom} pointerEvents="none" />

      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {showHeaderTrailing ? (
          <View style={styles.headerTrailing}>
            {date.trim().length > 0 ? (
              <Text style={styles.date}>{date}</Text>
            ) : null}
            {headerRight}
          </View>
        ) : null}
      </View>

      <View style={styles.contentRow}>
        <View style={styles.textCol}>
          <View style={styles.amountRow}>
            {isAmountLoading ? (
              <View style={styles.amountLoadingWrap}>
                <Spinner tone={amountSpinnerTone} size="small" />
              </View>
            ) : (
              <Text style={styles.amount}>{amount}</Text>
            )}
            {amountAccessory ? (
              <View style={styles.amountAccessory}>{amountAccessory}</View>
            ) : null}
          </View>
          {subtext.trim().length > 0 ? (
            <Text style={styles.subtext}>{subtext}</Text>
          ) : null}
        </View>
      </View>

      {showProgress ? (
        <View style={styles.progressBlock}>
          {progressLabel ? (
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>{progressLabel}</Text>
              <Text style={styles.progressValue}>
                {Math.round(progress * 100)}%
              </Text>
            </View>
          ) : null}
          <AnimatedProgressBar
            progress={progress}
            fillColor={colors.textOnPrimary}
            backgroundColor={hero.progressTrack}
            height={7}
            duration={850}
            animateOnceKey={progressAnimationKey}
          />
        </View>
      ) : actionLabel && onAction ? (
        <View style={styles.actionWrap}>
          <Text style={styles.actionText} onPress={onAction}>
            {actionLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const cardShadowStyle = Platform.select({
  android: {
    elevation: 6,
  },
  default: {
    shadowColor: colors.headerGradientStart,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 7,
  },
});

const styles = StyleSheet.create({
  card: {
    ...layout.heroCard,
    minHeight: 172,
    marginBottom: spacing.lg,
    ...cardShadowStyle,
  },
  /** Decorative orbs extend past radius — clip only when no header menu. */
  cardClipOrbs: {
    overflow: "hidden",
  },
  orbTop: {
    position: "absolute",
    top: -52,
    right: -42,
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: hero.orbLarge,
  },
  orbBottom: {
    position: "absolute",
    right: 28,
    bottom: -72,
    width: 138,
    height: 138,
    borderRadius: 69,
    backgroundColor: hero.orbSmall,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 0,
    position: "relative",
    zIndex: 5,
  },
  title: {
    fontFamily: typography.screenTitle.fontFamily,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "500",
    color: colors.textOnPrimary,
  },
  date: {
    fontFamily: typography.screenTitle.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    color: colors.textOnPrimaryMuted,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  amount: {
    fontFamily: typography.monoEmphasis.fontFamily,
    color: colors.textOnPrimary,
    fontSize: 28,
    lineHeight: 36,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  amountAccessory: {
    alignSelf: "center",
  },
  amountLoadingWrap: {
    minHeight: 36,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  subtext: {
    marginTop: spacing.xs,
    fontFamily: typography.screenTitle.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textOnPrimaryMuted,
  },
  progressBlock: {
    marginTop: spacing.xl,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  progressLabel: {
    fontFamily: typography.screenTitle.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textOnPrimaryMuted,
  },
  progressValue: {
    fontFamily: typography.monoEmphasis.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textOnPrimary,
  },
  actionWrap: {
    marginTop: spacing.xl,
    alignItems: "flex-start",
  },
  actionText: {
    fontFamily: typography.screenSubtitle.fontFamily,
    fontSize: 14,
    color: colors.textOnPrimary,
    textDecorationLine: "underline",
  },
});
