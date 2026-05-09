import { StyleSheet, Text, View } from "react-native";

import { AnimatedSparkBar } from "@/components/ui/AnimatedSparkBar";
import { colors, spacing, typography } from "@/constants/theme";

type HeroSummaryCardProps = {
  title: string;
  date: string;
  amount: string;
  subtext: string;
  sparkBarCount?: number;
};

export function HeroSummaryCard({
  title,
  date,
  amount,
  subtext,
  sparkBarCount = 7,
}: HeroSummaryCardProps) {
  return (
    <View style={[styles.card, styles.heroCard]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.date}>{date}</Text>
      </View>
      <View style={styles.contentRow}>
        <View style={styles.textCol}>
          <Text style={styles.amount}>{amount}</Text>
          <Text style={styles.subtext}>{subtext}</Text>
        </View>
        <View style={styles.sparkBarWrap}>
          <AnimatedSparkBar
            count={sparkBarCount}
            height={24}
            barWidth={6}
            gap={4}
            color="rgba(255,255,255,0.8)"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.barBackground,
    borderRadius: 20,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  heroCard: {
    backgroundColor: colors.headerGradientStart,
    borderColor: colors.headerGradientEnd,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  },
  textCol: {
    flex: 1,
  },
  amount: {
    fontFamily: typography.monoEmphasis.fontFamily,
    color: colors.textOnPrimary,
    fontSize: 28,
    lineHeight: 36,
  },
  subtext: {
    fontFamily: typography.screenTitle.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textOnPrimaryMuted,
    marginTop: spacing.xs,
  },
  sparkBarWrap: {
    alignItems: "flex-end",
  },
});