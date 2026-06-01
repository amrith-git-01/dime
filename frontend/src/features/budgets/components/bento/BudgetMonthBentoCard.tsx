import { Edit3 } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  BentoStatCell,
  MonthSummaryCardShell,
  MonthSummaryHeaderError,
  MonthSummaryHeaderKicker,
  MonthSummaryHeaderTitle,
  MonthSummaryStatDivider,
  MonthSummaryStatsRow,
  MonthSummaryUnavailableText,
  type BentoStatCellTone,
} from "@/components/shared";
import { Button, ProgressBar } from "@/components/ui";
import { colors, progressBar, radius, spacing, surfaces } from "@/constants";
import type { MonthOption } from "@/utils/buildMonthOptions";

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
  const remainingLabel = summary?.isOverBudget ? "Over" : "Remaining";
  const remainingValue = summary?.isOverBudget
    ? summary.overageDisplay
    : (summary?.remainingDisplay ?? "—");
  const remainingTone: BentoStatCellTone = summary?.isOverBudget
    ? "debit"
    : summary && summary.remainingValue > 0
      ? "credit"
      : "neutral";

  return (
    <MonthSummaryCardShell
      selectedMonth={selectedMonth}
      monthOptions={monthOptions}
      onSelectMonth={onSelectMonth}
      menuPlacement="inline"
      bodyKicker="Budget"
      headerContent={
        summaryFailed ? (
          <MonthSummaryHeaderError>
            Could not load spending for this month.
          </MonthSummaryHeaderError>
        ) : summaryLoading ? (
          <BudgetMonthHeaderSkeleton />
        ) : (
          <>
            <MonthSummaryHeaderKicker>This month</MonthSummaryHeaderKicker>
            <MonthSummaryHeaderTitle>
              {summary?.usageLabel ?? "No budget set"}
            </MonthSummaryHeaderTitle>
          </>
        )
      }
      headerActions={
        hasMonthlyBudget ? (
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
        ) : null
      }
    >
      {summaryFailed ? (
        <MonthSummaryUnavailableText />
      ) : summaryLoading ? (
        <BudgetMonthBodySkeleton />
      ) : (
        <>
          <MonthSummaryStatsRow>
            <BentoStatCell
              label="Budget"
              value={hasMonthlyBudget ? (summary?.budgetDisplay ?? "—") : "—"}
            />
            <MonthSummaryStatDivider />
            <BentoStatCell
              label="Spent"
              value={summary?.spentDisplay ?? "—"}
              tone={summary?.isOverBudget ? "debit" : "neutral"}
            />
            <MonthSummaryStatDivider />
            <BentoStatCell
              label={remainingLabel}
              value={remainingValue}
              tone={remainingTone}
            />
          </MonthSummaryStatsRow>

          {hasMonthlyBudget && summary ? (
            <View style={styles.progressWrap}>
              <ProgressBar
                progress={summary.usagePct}
                fillColor={summary.isOverBudget ? colors.danger : colors.primary}
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
    </MonthSummaryCardShell>
  );
});

const styles = StyleSheet.create({
  editButton: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: surfaces.whiteOverlay55,
  },
  editButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  progressWrap: {
    marginTop: spacing.md,
  },
  setBudgetWrap: {
    marginTop: spacing.md,
  },
});
