import { Edit3 } from "lucide-react-native";
import { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { HeroSummaryCard } from "@/components/home/HeroSummaryCard";
import { SelectDropdown } from "@/components/ui/SelectDropdown/SelectDropdown";
import { fontFamilies } from "@/constants/fonts";
import { colors, hero, spacing } from "@/constants/theme";
import { formatInrCompact } from "@/features/transactions/formatAmount";
import type { MonthOption } from "@/utils/buildMonthOptions";

export type BudgetListHeaderProps = {
  hasMonthlyBudget: boolean;
  selectedMonthLabel: string;
  monthOptions: MonthOption[];
  onSelectBudgetMonth: (index: number) => void;
  monthlyBudgetAmount: number;
  monthlyHeroSubtext: string;
  monthlyBudgetPct: number;
  showMonthlyHeroProgress: boolean;
  isHeroAmountLoading: boolean;
  onOpenBudgetEdit: () => void;
  /** When false, only the hero card renders (section title lives in the list). */
  showCategoriesSection?: boolean;
};

export const BudgetListHeader = memo(function BudgetListHeader({
  hasMonthlyBudget,
  selectedMonthLabel,
  monthOptions,
  onSelectBudgetMonth,
  monthlyBudgetAmount,
  monthlyHeroSubtext,
  monthlyBudgetPct,
  showMonthlyHeroProgress,
  isHeroAmountLoading,
  onOpenBudgetEdit,
  showCategoriesSection = true,
}: BudgetListHeaderProps) {
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
        onSelectBudgetMonth(index);
      }
    },
    [monthOptions, onSelectBudgetMonth],
  );

  return (
    <>
      {hasMonthlyBudget ? (
        <HeroSummaryCard
          title="Monthly Budget"
          date=""
          headerRight={
            <View style={styles.monthDropdownWrap}>
              <SelectDropdown
                options={dropdownOptions}
                value={selectedMonthLabel}
                onChange={handleMonthChange}
                variant="secondary"
                showLabel={false}
              />
            </View>
          }
          amount={formatInrCompact(monthlyBudgetAmount)}
          subtext={monthlyHeroSubtext}
          progress={monthlyBudgetPct}
          progressLabel="Monthly budget used"
          showProgress={showMonthlyHeroProgress}
          progressAnimationKey={`budget-hero-${selectedMonthLabel}`}
          isAmountLoading={isHeroAmountLoading}
          amountSpinnerTone="white"
          amountAccessory={
            <Pressable
              accessibilityRole="button"
              onPress={onOpenBudgetEdit}
              style={({ pressed }) => [
                styles.editBudgetButton,
                pressed && styles.editBudgetButtonPressed,
              ]}
            >
              <Edit3 size={14} color={colors.textOnPrimary} />
            </Pressable>
          }
        />
      ) : null}

      {showCategoriesSection ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>All categories</Text>
        </View>
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  monthDropdownWrap: {
    position: "relative",
    zIndex: 5,
    flexShrink: 0,
  },
  sectionHeader: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  editBudgetButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: hero.chipBorder,
    backgroundColor: hero.chipBg,
  },
  editBudgetButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
});
