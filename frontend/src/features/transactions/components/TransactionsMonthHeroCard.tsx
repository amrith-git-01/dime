import { memo, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { SelectDropdown } from "@/components/ui/SelectDropdown/SelectDropdown";
import { fontFamilies } from "@/constants/fonts";
import { colors, spacing } from "@/constants/theme";
import { formatTransactionListAmount } from "@/features/transactions/components/transactionListShared";
import type { MonthOption } from "@/utils/buildMonthOptions";

export type TransactionsMonthSummary = {
  credited: number;
  debited: number;
  net: number;
  count: number;
};

export type TransactionsMonthHeroCardProps = {
  selectedMonth: string;
  summary: TransactionsMonthSummary;
  summaryLoading: boolean;
  summaryFailed: boolean;
  onSelectMonth: (index: number) => void;
  monthOptions: MonthOption[];
};

const heroShadowStyle = Platform.select({
  android: {
    elevation: 6,
  },
  default: {
    shadowColor: colors.headerGradientStart,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 7,
  },
});

export const TransactionsMonthHeroCard = memo(
  function TransactionsMonthHeroCard({
    selectedMonth,
    summary,
    summaryLoading,
    summaryFailed,
    onSelectMonth,
    monthOptions,
  }: TransactionsMonthHeroCardProps) {
    const dropdownOptions = useMemo(
      () =>
        monthOptions.map((month) => ({
          label: month.label,
          value: month.label,
        })),
      [monthOptions],
    );

    const handleMonthChange = useCallback(
      (next: string) => {
        const index = monthOptions.findIndex((month) => month.label === next);
        if (index >= 0) {
          onSelectMonth(index);
        }
      },
      [monthOptions, onSelectMonth],
    );

    return (
      <View style={styles.heroCard}>
        <View style={styles.heroBubbleLarge} pointerEvents="none" />
        <View style={styles.heroBubbleSmall} pointerEvents="none" />

        <View style={styles.heroHeader}>
          <View style={styles.heroHeaderTopRow}>
            <Text style={styles.heroKicker}>Total Transactions</Text>
            <View style={styles.monthDropdownWrap}>
              <SelectDropdown
                options={dropdownOptions}
                value={selectedMonth}
                onChange={handleMonthChange}
                variant="secondary"
                showLabel={false}
              />
            </View>
          </View>

          <View style={styles.heroTitleRow}>
            {summaryFailed ? (
              <Text style={styles.heroTitle}>Could not load summary</Text>
            ) : summaryLoading ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.heroTitle}>{summary.count}</Text>
            )}
          </View>
        </View>

        <View style={styles.heroStatsGrid}>
          <View style={styles.heroStatCard}>
            <Text style={styles.heroStatLabel}>Credited</Text>
            {summaryLoading ? (
              <ActivityIndicator color={colors.textOnPrimary} size="small" />
            ) : (
              <Text style={styles.heroStatValue}>
                {summaryFailed
                  ? "—"
                  : formatTransactionListAmount(summary.credited)}
              </Text>
            )}
          </View>

          <View style={styles.heroStatCard}>
            <Text style={styles.heroStatLabel}>Debited</Text>
            {summaryLoading ? (
              <ActivityIndicator color={colors.textOnPrimary} size="small" />
            ) : (
              <Text style={styles.heroStatValue}>
                {summaryFailed
                  ? "—"
                  : formatTransactionListAmount(summary.debited)}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.heroNetCard}>
          <Text style={styles.heroStatLabel}>Net Amount</Text>
          {summaryLoading ? (
            <ActivityIndicator color={colors.textOnPrimary} size="small" />
          ) : (
            <Text style={styles.heroNetValue}>
              {summaryFailed ? "—" : formatTransactionListAmount(summary.net)}
            </Text>
          )}
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  heroCard: {
    position: "relative",
    overflow: "visible",
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: 22,
    backgroundColor: colors.headerGradientStart,
    borderWidth: 1,
    borderColor: colors.headerGradientEnd,
    zIndex: 3,
    ...heroShadowStyle,
  },
  heroBubbleLarge: {
    position: "absolute",
    top: -52,
    right: -42,
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  heroBubbleSmall: {
    position: "absolute",
    right: 28,
    bottom: -72,
    width: 138,
    height: 138,
    borderRadius: 69,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  heroHeader: {
    zIndex: 2,
    gap: 6,
  },
  heroHeaderTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  heroKicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textOnPrimary,
    flexShrink: 1,
  },
  heroTitle: {
    marginTop: 2,
    fontFamily: fontFamilies.semiBold,
    fontSize: 26,
    lineHeight: 32,
    color: colors.textOnPrimary,
  },
  heroTitleRow: {
    minHeight: 32,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  monthDropdownWrap: {
    position: "relative",
    zIndex: 5,
    flexShrink: 0,
  },
  heroStatsGrid: {
    zIndex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  heroStatCard: {
    flex: 1,
    minHeight: 58,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  heroNetCard: {
    zIndex: 1,
    marginTop: 6,
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  heroNetValue: {
    marginTop: 2,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 16,
    lineHeight: 20,
    color: colors.textOnPrimary,
  },
  heroStatLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textOnPrimaryMuted,
  },
  heroStatValue: {
    marginTop: 2,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.textOnPrimary,
  },
});
