import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  inkFaint,
  inkSoft,
  line,
  radius,
  shadows,
  spacing,
  surface,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";

type InsightsCardProps = {
  kicker: string;
  subtitle?: string;
  children: ReactNode;
};

/**
 * Shared white shadow card used across all Analytics / Insights metric cards.
 * Renders: card shell → header (kicker + subtitle) → hairline divider → children.
 */
export const InsightsCard = memo(function InsightsCard({
  kicker,
  subtitle,
  children,
}: InsightsCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.kicker}>{kicker}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.divider} />
      {children}
    </View>
  );
});

export const styles = StyleSheet.create({
  card: {
    backgroundColor: surface,
    borderRadius: radius.md,
    ...shadows.card,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: 2,
  },
  kicker: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 10,
    lineHeight: 14,
    color: inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkFaint,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: line,
    marginHorizontal: spacing.lg,
  },
});
