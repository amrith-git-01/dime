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
import { bento, colors, radius, spacing } from "@/constants/theme";
import type { MonthOption } from "@/utils/buildMonthOptions";

import { TRANSACTIONS_MONTH_DROPDOWN_VISIBLE } from "./transactionsBentoTokens";

export type TransactionsMonthBentoSummary = {
  transactionCount: number;
  spentDisplay: string;
  creditedDisplay: string;
  debitedDisplay: string;
  netDisplay: string;
  netValue: number;
};

export type TransactionsMonthBentoCardProps = {
  selectedMonth: string;
  summary: TransactionsMonthBentoSummary | null;
  summaryLoading: boolean;
  summaryFailed: boolean;
  onSelectMonth: (index: number) => void;
  monthOptions: MonthOption[];
};

function transactionCountLabel(count: number): string {
  if (count === 1) {
    return "1 transaction";
  }
  return `${count} transactions`;
}

function CashFlowStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "credit" | "debit" | "net-positive" | "net-negative";
}) {
  return (
    <View style={styles.cashFlowStat}>
      <Text style={styles.cashFlowStatLabel}>{label}</Text>
      <Text
        style={[
          styles.cashFlowStatValue,
          tone === "credit" && styles.cashFlowStatCredit,
          tone === "debit" && styles.cashFlowStatDebit,
          tone === "net-positive" && styles.cashFlowStatCredit,
          tone === "net-negative" && styles.cashFlowStatDebit,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

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

export const TransactionsMonthBentoCard = memo(
  function TransactionsMonthBentoCard({
    selectedMonth,
    summary,
    summaryLoading,
    summaryFailed,
    onSelectMonth,
    monthOptions,
  }: TransactionsMonthBentoCardProps) {
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
      <View style={[styles.card, cardShadowStyle]}>
        <View style={styles.headerSection}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              {summaryFailed ? (
                <Text style={styles.errorText}>Could not load summary</Text>
              ) : summaryLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : summary ? (
                <>
                  <Text style={styles.activityKicker}>This month</Text>
                  <Text style={styles.countText}>
                    {transactionCountLabel(summary.transactionCount)}
                  </Text>
                </>
              ) : null}
            </View>

            <View style={styles.dropdownWrap}>
              <SelectDropdown
                options={dropdownOptions}
                value={selectedMonth}
                onChange={handleMonthChange}
                variant="default"
                showLabel={false}
                size="compact"
                menuPlacement="modal"
                maxVisibleOptions={TRANSACTIONS_MONTH_DROPDOWN_VISIBLE}
              />
            </View>
          </View>
        </View>

        <View style={styles.cashFlowSection}>
          <Text style={styles.cashFlowKicker}>Cash flow</Text>
          {summaryFailed ? (
            <Text style={styles.cashFlowUnavailable}>—</Text>
          ) : summaryLoading ? (
            <View style={styles.cashFlowLoading}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : summary ? (
            <View style={styles.cashFlowStats}>
              <CashFlowStat
                label="Credited"
                value={summary.creditedDisplay}
                tone="credit"
              />
              <View style={styles.cashFlowDivider} />
              <CashFlowStat
                label="Debited"
                value={summary.debitedDisplay}
                tone="debit"
              />
              <View style={styles.cashFlowDivider} />
              <CashFlowStat
                label="Net"
                value={summary.netDisplay}
                tone={netTone(summary.netValue)}
              />
            </View>
          ) : null}
        </View>
      </View>
    );
  },
);

const cardShadowStyle = Platform.select({
  android: { elevation: 3 },
  default: {
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: "visible",
  },
  headerSection: {
    backgroundColor: bento.twoToneHeaderSurface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    justifyContent: "center",
  },
  dropdownWrap: {
    flexShrink: 0,
    width: 120,
  },
  activityKicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: bento.onPastel.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  countText: {
    marginTop: 4,
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.primary,
  },
  errorText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: bento.onPastel.primary,
  },
  cashFlowSection: {
    backgroundColor: bento.twoToneBodySurface,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  cashFlowKicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    color: bento.onPastel.muted,
    textTransform: "uppercase",
    letterSpacing: 0.45,
    marginBottom: spacing.sm,
  },
  cashFlowLoading: {
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  cashFlowUnavailable: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 15,
    lineHeight: 21,
    color: bento.onPastel.muted,
    textAlign: "center",
  },
  cashFlowStats: {
    flexDirection: "row",
    alignItems: "center",
  },
  cashFlowStat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  cashFlowStatLabel: {
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    lineHeight: 14,
    color: bento.onPastel.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  cashFlowStatValue: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: bento.onPastel.primary,
  },
  cashFlowStatCredit: {
    color: colors.success,
  },
  cashFlowStatDebit: {
    color: colors.danger,
  },
  cashFlowDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(99, 85, 232, 0.14)",
    marginHorizontal: spacing.xs,
  },
});
