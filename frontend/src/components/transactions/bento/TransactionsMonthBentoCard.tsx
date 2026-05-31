import { memo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { BENTO_MONTH_DROPDOWN_VISIBLE } from "@/components/bento/bentoMonthPickerTokens";
import { useBentoMonthDropdown } from "@/components/bento/useBentoMonthDropdown";
import { BentoStatCell, netTone, TwoToneCard } from "@/components/shared";
import { SelectDropdown } from "@/components/ui/SelectDropdown/SelectDropdown";
import { bento, colors, spacing, surfaces } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { MonthOption } from "@/utils/buildMonthOptions";

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
  return count === 1 ? "1 transaction" : `${count} transactions`;
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
    const { dropdownOptions, handleMonthChange } = useBentoMonthDropdown(
      monthOptions,
      onSelectMonth,
    );

    return (
      <TwoToneCard
        header={
          <View style={styles.headerInner}>
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
                maxVisibleOptions={BENTO_MONTH_DROPDOWN_VISIBLE}
              />
            </View>
          </View>
        }
        body={
          <View style={styles.bodyInner}>
            <Text style={styles.cashFlowKicker}>Cash flow</Text>
            {summaryFailed ? (
              <Text style={styles.cashFlowUnavailable}>—</Text>
            ) : summaryLoading ? (
              <View style={styles.cashFlowLoading}>
                <ActivityIndicator color={colors.primary} size="small" />
              </View>
            ) : summary ? (
              <View style={styles.cashFlowStats}>
                <BentoStatCell
                  label="Credited"
                  value={summary.creditedDisplay}
                  tone="credit"
                />
                <View style={styles.divider} />
                <BentoStatCell
                  label="Debited"
                  value={summary.debitedDisplay}
                  tone="debit"
                />
                <View style={styles.divider} />
                <BentoStatCell
                  label="Net"
                  value={summary.netDisplay}
                  tone={netTone(summary.netValue)}
                />
              </View>
            ) : null}
          </View>
        }
      />
    );
  },
);

const styles = StyleSheet.create({
  headerInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
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
  bodyInner: {
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
  divider: {
    width: 1,
    height: 28,
    backgroundColor: surfaces.primaryTint14,
    marginHorizontal: spacing.xs,
  },
});
