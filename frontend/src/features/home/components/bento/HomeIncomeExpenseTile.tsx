import { memo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { BentoStatCell, netTone } from "@/components/shared";
import { Spinner } from "@/components/ui";
import { bento, radius, spacing, surfaces } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import { HOME_INCOME_TILE_MIN_HEIGHT } from "./homeBentoTokens";

export type HomeIncomeExpenseTileProps = {
  creditedDisplay: string;
  debitedDisplay: string;
  netDisplay: string;
  netValue: number;
  isPending: boolean;
  onPress: () => void;
};

/**
 * Full-width cashflow tile — soft mint pastel with dark type.
 */
export const HomeIncomeExpenseTile = memo(function HomeIncomeExpenseTile({
  creditedDisplay,
  debitedDisplay,
  netDisplay,
  netValue,
  isPending,
  onPress,
}: HomeIncomeExpenseTileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="View income vs expense — navigates to transactions"
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        shadowStyle,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.title}>Cash flow · this month</Text>

      {isPending ? (
        <View style={styles.spinnerWrap}>
          <Spinner tone="primary" size="small" />
        </View>
      ) : (
        <View style={styles.statsRow}>
          <BentoStatCell
            label="Credited"
            value={creditedDisplay}
            tone="credit"
          />
          <View style={styles.divider} />
          <BentoStatCell label="Debited" value={debitedDisplay} tone="debit" />
          <View style={styles.divider} />
          <BentoStatCell
            label="Net"
            value={netDisplay}
            tone={netTone(netValue)}
          />
        </View>
      )}
    </Pressable>
  );
});

const shadowStyle = Platform.select({
  android: { elevation: 2 },
  default: {
    shadowColor: bento.surface.mint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
});

const styles = StyleSheet.create({
  tile: {
    backgroundColor: bento.incomeExpenseSurface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    minHeight: HOME_INCOME_TILE_MIN_HEIGHT,
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.91,
    transform: [{ scale: 0.99 }],
  },
  title: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: bento.onPastel.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  spinnerWrap: {
    height: 40,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: surfaces.primaryTint12,
    marginHorizontal: spacing.xs,
  },
});
