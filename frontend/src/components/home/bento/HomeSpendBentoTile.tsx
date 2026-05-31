import { memo, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { bento, colors, radius, spacing } from "@/constants/theme";

import { BentoAmountRow } from "./BentoAmountRow";
import { HOME_SPEND_FLEX } from "./homeBentoTokens";

export type HomeSpendBentoTileVariant = "today" | "month";

type HomeSpendBentoTileProps = {
  variant: HomeSpendBentoTileVariant;
  title: string;
  periodLabel: string;
  amount: string;
  subtext: string;
  hasBudget: boolean;
  onAddBudget: () => void;
  addBudgetLabel: string;
  addBudgetAccessibilityLabel: string;
  bodyStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
};

const TILE_THEMES = {
  today: {
    flex: HOME_SPEND_FLEX.today,
    backgroundColor: colors.headerGradientStart,
    amountVariant: "onDark" as const,
    labelColor: bento.onSurface.muted,
    dateColor: bento.onSurface.secondary,
    subtextColor: bento.onSurface.secondary,
    ctaColor: bento.onSurface.primary,
    shadow: Platform.select({
      android: { elevation: 5 },
      default: {
        shadowColor: colors.headerGradientStart,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 14,
      },
    }),
  },
  month: {
    flex: HOME_SPEND_FLEX.month,
    backgroundColor: bento.monthSpendSurface,
    amountVariant: "onPastel" as const,
    labelColor: bento.onPastel.muted,
    dateColor: bento.onPastel.secondary,
    subtextColor: bento.onPastel.secondary,
    ctaColor: bento.onPastel.accent,
    shadow: Platform.select({
      android: { elevation: 3 },
      default: {
        shadowColor: bento.surface.sky,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
      },
    }),
  },
} as const;

/**
 * Shared shell for Home spend bento tiles (today + month).
 * Same layout: header, amount, body slot, footer subtext or budget CTA.
 */
export const HomeSpendBentoTile = memo(function HomeSpendBentoTile({
  variant,
  title,
  periodLabel,
  amount,
  subtext,
  hasBudget,
  onAddBudget,
  addBudgetLabel,
  addBudgetAccessibilityLabel,
  bodyStyle,
  children,
}: HomeSpendBentoTileProps) {
  const theme = TILE_THEMES[variant];

  return (
    <View
      style={[
        styles.tile,
        {
          flex: theme.flex,
          backgroundColor: theme.backgroundColor,
        },
        theme.shadow,
      ]}
    >
      <View style={styles.header}>
        <Text
          style={[styles.label, { color: theme.labelColor }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={[styles.date, { color: theme.dateColor }]}
          numberOfLines={1}
        >
          {periodLabel}
        </Text>
      </View>

      <BentoAmountRow amount={amount} variant={theme.amountVariant} />

      <View style={[styles.body, bodyStyle]}>{children}</View>

      <View style={styles.footer}>
        {subtext.trim().length > 0 ? (
          <Text
            style={[styles.subtext, { color: theme.subtextColor }]}
            numberOfLines={2}
          >
            {subtext}
          </Text>
        ) : !hasBudget ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={addBudgetAccessibilityLabel}
            onPress={onAddBudget}
            style={styles.ctaWrap}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.ctaText, { color: theme.ctaColor }]}>
              {addBudgetLabel}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.footerSpacer} />
        )}
      </View>
    </View>
  );
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
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  date: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  body: {
    flex: 1,
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
  },
  ctaWrap: {
    alignSelf: "flex-start",
  },
  ctaText: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    textDecorationLine: "underline",
  },
});
