import { memo, useCallback, useMemo } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { TwoToneCard } from "@/components/shared";
import { bento, colors, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { TransactionRow } from "@/features/transactions/types";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";

import {
  buildTopExpensesBarRows,
  type TopExpenseBarRow,
} from "../utils/buildTopExpensesBarRows";
import { InsightsTopExpensesSkeleton } from "./InsightsAnalyticsSkeletons";

export type InsightsTopExpensesCardProps = {
  topExpenses: TransactionRow[];
  loading?: boolean;
  onTransactionPress: (transaction: TransactionRow) => void;
};

type TopExpenseRowProps = {
  row: TopExpenseBarRow;
  onPress: (transaction: TransactionRow) => void;
};

const TopExpenseRow = memo(function TopExpenseRow({
  row,
  onPress,
}: TopExpenseRowProps) {
  const handlePress = useCallback(() => {
    if (row.transaction == null) {
      return;
    }
    triggerLightHaptic();
    onPress(row.transaction);
  }, [onPress, row.transaction]);

  const barFillStyle = useMemo(
    (): StyleProp<ViewStyle> => [
      styles.barFill,
      {
        width: `${Math.round(row.barFraction * 100)}%`,
        backgroundColor: row.barColor,
        opacity: row.isPlaceholder ? 0.2 : 1,
      },
    ],
    [row.barColor, row.barFraction, row.isPlaceholder],
  );

  return (
    <Pressable
      accessibilityRole={row.isPlaceholder ? "text" : "button"}
      accessibilityLabel={
        row.isPlaceholder
          ? undefined
          : `${row.merchant}, ${row.amountDisplay}, ${row.meta}`
      }
      disabled={row.isPlaceholder}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.row,
        !row.isPlaceholder && pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.rowHeader}>
        <Text style={styles.merchant} numberOfLines={1}>
          {row.merchant}
        </Text>
        <Text
          style={[styles.amount, row.isPlaceholder && styles.amountPlaceholder]}
          numberOfLines={1}
        >
          {row.amountDisplay}
        </Text>
      </View>
      <Text style={styles.meta} numberOfLines={1}>
        {row.meta}
      </Text>
      <View style={styles.barTrack}>
        <View style={barFillStyle} />
      </View>
    </Pressable>
  );
});

export const InsightsTopExpensesCard = memo(function InsightsTopExpensesCard({
  topExpenses,
  loading = false,
  onTransactionPress,
}: InsightsTopExpensesCardProps) {
  const rows = useMemo(
    () => buildTopExpensesBarRows(topExpenses),
    [topExpenses],
  );

  return (
    <TwoToneCard
      header={
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Top expenses</Text>
          <Text style={styles.headerSubtitle}>Largest debits this month</Text>
        </View>
      }
      body={
        <View style={styles.body}>
          {loading ? (
            <InsightsTopExpensesSkeleton />
          ) : (
            <View style={styles.list}>
              {rows.map((row) => (
                <TopExpenseRow
                  key={row.key}
                  row={row}
                  onPress={onTransactionPress}
                />
              ))}
            </View>
          )}
        </View>
      }
    />
  );
});

const rowShadow = Platform.select({
  android: { elevation: 0 },
  default: {},
});

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.primary,
  },
  headerSubtitle: {
    marginTop: 2,
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: bento.onPastel.muted,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  list: {
    gap: spacing.md,
  },
  row: {
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    ...rowShadow,
  },
  rowPressed: {
    opacity: 0.88,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  merchant: {
    flex: 1,
    minWidth: 0,
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  amount: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
  },
  amountPlaceholder: {
    color: bento.onPastel.muted,
  },
  meta: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    color: bento.onPastel.muted,
  },
  barTrack: {
    marginTop: 2,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderList,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
    minWidth: 0,
  },
});
