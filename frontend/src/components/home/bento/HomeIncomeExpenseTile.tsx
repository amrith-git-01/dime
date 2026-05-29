import { memo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { Spinner } from "@/components/ui/Spinner";
import { fontFamilies } from "@/constants/fonts";
import { bento, colors, radius, spacing } from "@/constants/theme";

import { HOME_INCOME_TILE_MIN_HEIGHT } from "./homeBentoTokens";

export type HomeIncomeExpenseTileProps = {
  creditedDisplay: string;
  debitedDisplay: string;
  netDisplay: string;
  netValue: number;
  isPending: boolean;
  onPress: () => void;
};

function netTone(
  netValue: number,
): "net-positive" | "net-negative" | "neutral" {
  if (netValue > 0) {
    return "net-positive";
  }
  if (netValue < 0) {
    return "net-negative";
  }
  return "neutral";
}

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
          <Stat label="Credited" value={creditedDisplay} tone="credit" />
          <View style={styles.divider} />
          <Stat label="Debited" value={debitedDisplay} tone="debit" />
          <View style={styles.divider} />
          <Stat label="Net" value={netDisplay} tone={netTone(netValue)} />
        </View>
      )}
    </Pressable>
  );
});

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "credit" | "debit" | "net-positive" | "net-negative";
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[
          styles.statValue,
          tone === "credit" && styles.statValueCredit,
          tone === "debit" && styles.statValueDebit,
          tone === "net-positive" && styles.statValueCredit,
          tone === "net-negative" && styles.statValueDebit,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

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
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statLabel: {
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    lineHeight: 14,
    color: bento.onPastel.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statValue: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 15,
    lineHeight: 21,
    color: bento.onPastel.primary,
  },
  statValueCredit: {
    color: colors.success,
  },
  statValueDebit: {
    color: colors.danger,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(99, 85, 232, 0.12)",
    marginHorizontal: spacing.xs,
  },
});
