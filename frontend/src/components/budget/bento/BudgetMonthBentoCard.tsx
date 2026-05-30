import { Edit3 } from "lucide-react-native";
import { memo, useCallback, useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SelectDropdown } from "@/components/ui/SelectDropdown/SelectDropdown";
import { fontFamilies } from "@/constants/fonts";
import { bento, colors, progressBar, radius, spacing } from "@/constants/theme";
import type { MonthOption } from "@/utils/buildMonthOptions";

import { BUDGET_MONTH_DROPDOWN_VISIBLE } from "./budgetBentoTokens";
import {
  BudgetMonthBodySkeleton,
  BudgetMonthHeaderSkeleton,
} from "./BudgetMonthBentoSkeleton";

export type BudgetMonthBentoSummary = {
  budgetDisplay: string;
  spentDisplay: string;
  remainingDisplay: string;
  spentValue: number;
  budgetValue: number;
  remainingValue: number;
  isOverBudget: boolean;
  overageDisplay: string;
  usagePct: number;
  usageLabel: string;
};

export type BudgetMonthBentoCardProps = {
  selectedMonth: string;
  monthOptions: MonthOption[];
  onSelectMonth: (index: number) => void;
  hasMonthlyBudget: boolean;
  summary: BudgetMonthBentoSummary | null;
  summaryLoading: boolean;
  summaryFailed: boolean;
  onEditBudget: () => void;
  onSetBudget: () => void;
};

function BudgetStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "debit" | "credit";
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[
          styles.statValue,
          tone === "credit" && styles.statValueCredit,
          tone === "debit" && styles.statValueDebit,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

export const BudgetMonthBentoCard = memo(function BudgetMonthBentoCard({
  selectedMonth,
  monthOptions,
  onSelectMonth,
  hasMonthlyBudget,
  summary,
  summaryLoading,
  summaryFailed,
  onEditBudget,
  onSetBudget,
}: BudgetMonthBentoCardProps) {
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

  const remainingLabel = summary?.isOverBudget ? "Over" : "Remaining";
  const remainingValue = summary?.isOverBudget
    ? summary.overageDisplay
    : (summary?.remainingDisplay ?? "—");
  const remainingTone = summary?.isOverBudget
    ? "debit"
    : summary && summary.remainingValue > 0
      ? "credit"
      : "neutral";

  return (
    <View style={[styles.card, cardShadowStyle]}>
      <View style={styles.headerSection}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {summaryFailed ? (
              <Text style={styles.errorText}>
                Could not load spending for this month.
              </Text>
            ) : summaryLoading ? (
              <BudgetMonthHeaderSkeleton />
            ) : (
              <>
                <Text style={styles.activityKicker}>This month</Text>
                <Text style={styles.statusText}>
                  {summary?.usageLabel ?? "No budget set"}
                </Text>
              </>
            )}
          </View>

          <View style={styles.headerRight}>
            {hasMonthlyBudget ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit monthly budget"
                onPress={onEditBudget}
                style={({ pressed }) => [
                  styles.editButton,
                  pressed && styles.editButtonPressed,
                ]}
              >
                <Edit3 size={16} color={colors.primary} strokeWidth={2} />
              </Pressable>
            ) : null}
            <View style={styles.dropdownWrap}>
              <SelectDropdown
                options={dropdownOptions}
                value={selectedMonth}
                onChange={handleMonthChange}
                variant="default"
                showLabel={false}
                size="compact"
                menuPlacement="inline"
                maxVisibleOptions={BUDGET_MONTH_DROPDOWN_VISIBLE}
              />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.bodySection}>
        <Text style={styles.bodyKicker}>Budget</Text>

        {summaryFailed ? (
          <Text style={styles.unavailable}>—</Text>
        ) : summaryLoading ? (
          <BudgetMonthBodySkeleton />
        ) : (
          <>
            <View style={styles.statsRow}>
              <BudgetStat
                label="Budget"
                value={hasMonthlyBudget ? (summary?.budgetDisplay ?? "—") : "—"}
              />
              <View style={styles.divider} />
              <BudgetStat
                label="Spent"
                value={summary?.spentDisplay ?? "—"}
                tone={summary?.isOverBudget ? "debit" : "neutral"}
              />
              <View style={styles.divider} />
              <BudgetStat
                label={remainingLabel}
                value={remainingValue}
                tone={remainingTone}
              />
            </View>

            {hasMonthlyBudget && summary ? (
              <View style={styles.progressWrap}>
                <ProgressBar
                  progress={summary.usagePct}
                  fillColor={
                    summary.isOverBudget ? colors.danger : colors.primary
                  }
                  backgroundColor={progressBar.track}
                  height={8}
                />
              </View>
            ) : null}

            {!hasMonthlyBudget ? (
              <View style={styles.setBudgetWrap}>
                <Button title="Set budget" onPress={onSetBudget} />
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
});

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
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 0,
  },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: "rgba(255, 255, 255, 0.55)",
  },
  editButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  dropdownWrap: {
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
  statusText: {
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
  bodySection: {
    backgroundColor: bento.twoToneBodySurface,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bodyKicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    color: bento.onPastel.muted,
    textTransform: "uppercase",
    letterSpacing: 0.45,
    marginBottom: spacing.sm,
  },
  unavailable: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 15,
    lineHeight: 21,
    color: bento.onPastel.muted,
    textAlign: "center",
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
    fontSize: 14,
    lineHeight: 20,
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
    backgroundColor: "rgba(99, 85, 232, 0.14)",
    marginHorizontal: spacing.xs,
  },
  progressWrap: {
    marginTop: spacing.md,
  },
  setBudgetWrap: {
    marginTop: spacing.md,
  },
});
