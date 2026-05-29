import { memo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { bento, colors, radius, spacing } from "@/constants/theme";

import { BentoAmountRow } from "./BentoAmountRow";
import { BentoSevenDayBarChart } from "./BentoSevenDayBarChart";
import { HOME_SPEND_FLEX } from "./homeBentoTokens";

type HomeTodayTileProps = {
  dayLabel: string;
  spentAmount: string;
  subtext: string;
  last7DaysSpend: { date: string; total: number }[];
  isLoading: boolean;
};

/**
 * Spent Today bento tile — dual amounts parallel, 7-day chart, subtext at bottom.
 */
export const HomeTodayTile = memo(function HomeTodayTile({
  dayLabel,
  spentAmount,
  subtext,
  last7DaysSpend,
  isLoading,
}: HomeTodayTileProps) {
  return (
    <View
      style={[
        styles.tile,
        {
          flex: HOME_SPEND_FLEX.today,
          backgroundColor: colors.headerGradientStart,
        },
        todayShadowStyle,
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.label} numberOfLines={1}>
          Spent today
        </Text>
        <Text style={styles.date} numberOfLines={1}>
          {dayLabel}
        </Text>
      </View>

      <BentoAmountRow
        amount={spentAmount}
        isLoading={isLoading}
        variant="onDark"
      />

      <View style={styles.chartWrap}>
        <BentoSevenDayBarChart days={last7DaysSpend} />
      </View>

      <View style={styles.footer}>
        {subtext.trim().length > 0 ? (
          <Text style={styles.subtext} numberOfLines={2}>
            {subtext}
          </Text>
        ) : (
          <View style={styles.footerSpacer} />
        )}
      </View>
    </View>
  );
});

const todayShadowStyle = Platform.select({
  android: { elevation: 5 },
  default: {
    shadowColor: colors.headerGradientStart,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
  },
});

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.lg,
    padding: spacing.md,
    paddingBottom: spacing.sm,
    justifyContent: "space-between",
  },
  header: {
    marginBottom: spacing.sm,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    color: bento.onSurface.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  date: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 17,
    color: bento.onSurface.secondary,
    marginTop: 2,
  },
  chartWrap: {
    flex: 1,
    justifyContent: "center",
    minHeight: 54,
    marginVertical: spacing.sm,
  },
  footer: {
    marginTop: "auto",
    minHeight: 16,
  },
  footerSpacer: {
    height: 16,
  },
  subtext: {
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    lineHeight: 14,
    color: bento.onSurface.secondary,
  },
});
