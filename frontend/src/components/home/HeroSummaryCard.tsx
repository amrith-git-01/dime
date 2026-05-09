import { StyleSheet, Text, View } from "react-native";

import { AnimatedProgressBar } from "@/components/ui/AnimatedProgressBar";
import { colors, spacing, typography } from "@/constants/theme";

type HeroSummaryCardProps = {
  title: string;
  date: string;
  amount: string;
  subtext: string;
  progress: number;
  progressLabel?: string;
};

export function HeroSummaryCard({
  title,
  date,
  amount,
  subtext,
  progress,
  progressLabel,
}: HeroSummaryCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.orbTop} pointerEvents="none" />
      <View style={styles.orbBottom} pointerEvents="none" />

      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.date}>{date}</Text>
      </View>

      <View style={styles.contentRow}>
        <View style={styles.textCol}>
          <Text style={styles.amount}>{amount}</Text>
          <Text style={styles.subtext}>{subtext}</Text>
        </View>
      </View>

      <View style={styles.progressBlock}>
        {progressLabel ? (
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>{progressLabel}</Text>
            <Text style={styles.progressValue}>{Math.round(progress * 100)}%</Text>
          </View>
        ) : null}
        <AnimatedProgressBar
          progress={progress}
          fillColor={colors.textOnPrimary}
          backgroundColor="rgba(255,255,255,0.24)"
          height={7}
          duration={850}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 172,
    overflow: "hidden",
    borderRadius: 22,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: colors.headerGradientStart,
    borderWidth: 1,
    borderColor: colors.headerGradientEnd,
    shadowColor: colors.headerGradientStart,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 7,
  },
  orbTop: {
    position: "absolute",
    top: -52,
    right: -42,
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  orbBottom: {
    position: "absolute",
    right: 28,
    bottom: -72,
    width: 138,
    height: 138,
    borderRadius: 69,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
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
});
