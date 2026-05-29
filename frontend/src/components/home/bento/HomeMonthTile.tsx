import { memo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { bento, radius, spacing } from "@/constants/theme";

import { BentoAmountRow } from "./BentoAmountRow";
import { BentoProgressRing } from "./BentoProgressRing";
import { HOME_SPEND_FLEX } from "./homeBentoTokens";

const MONTH_RING_SIZE = 80;
const MONTH_RING_STROKE = 7;

type HomeMonthTileProps = {
  monthLabel: string;
  spentAmount: string;
  subtext: string;
  monthlyProgress: number;
  showRing: boolean;
  hasBudget: boolean;
  isLoading: boolean;
  onNavigateBudgets: () => void;
};

/**
 * Month spend bento tile — dual amounts parallel, centered ring below, subtext at bottom.
 */
export const HomeMonthTile = memo(function HomeMonthTile({
  monthLabel,
  spentAmount,
  subtext,
  monthlyProgress,
  showRing,
  hasBudget,
  isLoading,
  onNavigateBudgets,
}: HomeMonthTileProps) {
  return (
    <View
      style={[
        styles.tile,
        {
          flex: HOME_SPEND_FLEX.month,
          backgroundColor: bento.monthSpendSurface,
        },
        monthShadowStyle,
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.label} numberOfLines={1}>
          Spent this month
        </Text>
        <Text style={styles.date} numberOfLines={1}>
          {monthLabel}
        </Text>
      </View>

      <BentoAmountRow
        amount={spentAmount}
        isLoading={isLoading}
        variant="onPastel"
      />

      {showRing ? (
        <View style={styles.ringWrap} pointerEvents="none">
          <BentoProgressRing
            progress={monthlyProgress}
            size={MONTH_RING_SIZE}
            strokeWidth={MONTH_RING_STROKE}
            showLabel
            variant="light"
          />
        </View>
      ) : (
        <View style={styles.ringSpacer} />
      )}

      <View style={styles.footer}>
        {subtext.trim().length > 0 ? (
          <Text style={styles.subtext} numberOfLines={2}>
            {subtext}
          </Text>
        ) : !isLoading && !hasBudget ? (
          <Pressable
            accessibilityRole="button"
            onPress={onNavigateBudgets}
            style={styles.ctaWrap}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.ctaText}>Add monthly budget</Text>
          </Pressable>
        ) : (
          <View style={styles.footerSpacer} />
        )}
      </View>
    </View>
  );
});

const monthShadowStyle = Platform.select({
  android: { elevation: 3 },
  default: {
    shadowColor: bento.surface.sky,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
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
    color: bento.onPastel.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  date: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 17,
    color: bento.onPastel.secondary,
    marginTop: 2,
  },
  ringWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: MONTH_RING_SIZE + spacing.sm,
    marginVertical: spacing.xs,
  },
  ringSpacer: {
    flex: 1,
    minHeight: spacing.md,
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
    color: bento.onPastel.secondary,
  },
  ctaWrap: {
    alignSelf: "flex-start",
  },
  ctaText: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    color: bento.onPastel.accent,
    textDecorationLine: "underline",
  },
});
