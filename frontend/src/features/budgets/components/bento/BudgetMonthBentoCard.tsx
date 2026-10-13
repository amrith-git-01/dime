import { Edit3 } from "lucide-react-native";
import { memo } from "react";
import { Pressable, View } from "react-native";

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
import {
  Button,
  ProgressBar,
  SkeletonBlock,
  SkeletonStrip,
} from "@/components/ui";
import { radius, spacing } from "@/constants";
import type { MonthOption } from "@/utils/buildMonthOptions";
import { createThemedStyles, useTheme } from "@/theme";

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
  /** Whole percent of budget spent (uncapped — can exceed 100). */
  usagePercentUsed: number;
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
  onMonthMenuOpenChange?: (open: boolean) => void;
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
  onMonthMenuOpenChange,
}: BudgetMonthBentoCardProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const remainingLabel =
    summaryLoading || !summary?.isOverBudget ? "Remaining" : "Over";
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
      onMonthMenuOpenChange={onMonthMenuOpenChange}
      bodyKicker="Budget"
      headerContent={
        summaryFailed ? (
          <MonthSummaryHeaderError>
            Could not load spending for this month.
          </MonthSummaryHeaderError>
        ) : (
          <>
            <MonthSummaryHeaderKicker>This month</MonthSummaryHeaderKicker>
            {summaryLoading ? (
              <SkeletonStrip
                variant="statValue"
                style={styles.headerTitleSkeleton}
              />
            ) : (
              <MonthSummaryHeaderTitle>
                {summary?.usageLabel ?? "No budget set"}
              </MonthSummaryHeaderTitle>
            )}
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
            <Edit3 size={16} color={colors.accentText} strokeWidth={2} />
          </Pressable>
        ) : null
      }
    >
      {summaryFailed ? (
        <MonthSummaryUnavailableText />
      ) : (
        <>
          <MonthSummaryStatsRow>
            <BentoStatCell
              label="Budget"
              value={hasMonthlyBudget ? (summary?.budgetDisplay ?? "—") : "—"}
              isValueLoading={summaryLoading}
            />
            <MonthSummaryStatDivider />
            <BentoStatCell
              label="Spent"
              value={summary?.spentDisplay ?? "—"}
              tone={summary?.isOverBudget ? "debit" : "neutral"}
              isValueLoading={summaryLoading}
            />
            <MonthSummaryStatDivider />
            <BentoStatCell
              label={remainingLabel}
              value={remainingValue}
              tone={remainingTone}
              isValueLoading={summaryLoading}
            />
          </MonthSummaryStatsRow>

          {summaryLoading && hasMonthlyBudget ? (
            <View style={styles.progressWrap}>
              <SkeletonBlock tone="surface" style={styles.progressSkeleton} />
            </View>
          ) : hasMonthlyBudget && summary ? (
            <View style={styles.progressWrap}>
              <ProgressBar
                progress={summary.usagePct}
                fillColor={
                  summary.isOverBudget ? colors.danger : colors.accent
                }
                backgroundColor={colors.surfaceSunken}
                height={8}
              />
            </View>
          ) : null}

          {!hasMonthlyBudget && !summaryLoading ? (
            <View style={styles.setBudgetWrap}>
              <Button title="Set budget" onPress={onSetBudget} />
            </View>
          ) : null}
        </>
      )}
    </MonthSummaryCardShell>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  editButton: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaces.whiteOverlay55,
  },
  editButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  headerTitleSkeleton: {
    width: "50%",
    marginTop: 2,
  },
  progressWrap: {
    marginTop: spacing.md,
  },
  progressSkeleton: {
    width: "100%",
    height: 8,
    borderRadius: radius.full,
  },
  setBudgetWrap: {
    marginTop: spacing.md,
  },
}));
