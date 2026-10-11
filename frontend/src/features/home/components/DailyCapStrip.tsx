import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ProgressBar } from "@/components/ui";
import {
  accent,
  danger,
  ink,
  inkSoft,
  surface,
  surfaceSunken,
} from "@/constants/colors";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { shadows } from "@/constants/shadows";
import { spacing } from "@/constants/spacing";

type DailyCapStripProps = {
  spentDisplay: string;
  /** "₹X / ₹Y" subtext, empty when no budget. */
  subtext: string;
  hasBudget: boolean;
  progress: number;
  onAddBudget: () => void;
};

export const DailyCapStrip = memo(function DailyCapStrip({
  spentDisplay,
  subtext,
  hasBudget,
  progress,
  onAddBudget,
}: DailyCapStripProps) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.label}>Daily</Text>
        {hasBudget ? (
          <Text style={styles.amount}>{subtext}</Text>
        ) : (
          <View style={styles.noBudgetRow}>
            <Text style={styles.spentOnly}>{spentDisplay} today</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onAddBudget}
              hitSlop={6}
            >
              <Text style={styles.cta}>Set limit ›</Text>
            </Pressable>
          </View>
        )}
      </View>
      {hasBudget && (
        <ProgressBar
          progress={progress}
          fillColor={progress >= 1 ? danger : accent}
          backgroundColor={surfaceSunken}
          height={4}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: inkSoft,
  },
  amount: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 18,
    color: ink,
    fontVariant: ["tabular-nums"],
  },
  noBudgetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  spentOnly: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: inkSoft,
    fontVariant: ["tabular-nums"],
  },
  cta: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: accent,
  },
});
