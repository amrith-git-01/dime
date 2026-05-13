import { useFocusEffect } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { getDaysInMonth } from "date-fns";
import { Edit3 } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { HeroSummaryCard } from "@/components/home/HeroSummaryCard";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { AnimatedProgressBar } from "@/components/ui/AnimatedProgressBar";
import { Button } from "@/components/ui/Button/Button";
import { SelectDropdown } from "@/components/ui/SelectDropdown/SelectDropdown";
import { TextField } from "@/components/ui/TextField/TextField";
import { fontFamilies } from "@/constants/fonts";
import { colors, spacing, typography } from "@/constants/theme";
import {
  useBudgetQuery,
  useUpsertBudgetMutation,
} from "@/features/budgets/hooks/useBudget";
import { CategoryLucideIcon } from "@/features/categories/components/CategoryLucideIcon";
import { useLocalCategories } from "@/features/categories/hooks/useLocalCategories";
import { formatInrCompact } from "@/features/transactions/formatAmount";
import {
  useMonthDebitTotalsByCategoryQuery,
  useMonthSummaryQuery,
} from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import { buildMonthOptions } from "@/utils/buildMonthOptions";

type CategorySpendRow = {
  id: string;
  name: string;
  icon_name: string;
  color: string;
  spentMonth: number;
};

const UNCATEGORIZED_SPEND_KEY = "__uncategorized__";
const FALLBACK_CATEGORY_COLOR = "#94A3B8";

export default function BudgetScreen() {
  const { data: categories, loading } = useLocalCategories();
  const { data: budgetResp, isPending: isBudgetLoading } = useBudgetQuery();
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0);
  const selected = monthOptions[selectedMonthIndex] ?? monthOptions[0];

  const monthSummaryQuery = useMonthSummaryQuery(
    selected.year,
    selected.monthIndex0,
  );
  const { data: spendByCategory = {} } = useMonthDebitTotalsByCategoryQuery(
    selected.year,
    selected.monthIndex0,
  );
  const upsertBudgetMutation = useUpsertBudgetMutation();

  const existingBudget = budgetResp?.budget
    ? Number.parseFloat(budgetResp.budget.monthly_budget)
    : 0;
  const hasMonthlyBudget =
    Number.isFinite(existingBudget) && existingBudget > 0;

  const [monthlyBudgetText, setMonthlyBudgetText] = React.useState("");
  const [isEditOpen, setIsEditOpen] = React.useState(false);

  React.useEffect(() => {
    if (!hasMonthlyBudget) {
      setMonthlyBudgetText("");
      return;
    }
    setMonthlyBudgetText(String(Math.round(existingBudget)));
  }, [existingBudget, hasMonthlyBudget]);

  React.useEffect(() => {
    if (upsertBudgetMutation.isSuccess) {
      setIsEditOpen(false);
    }
  }, [upsertBudgetMutation.isSuccess]);

  useFocusEffect(
    React.useCallback(() => {
      return () => setIsEditOpen(false);
    }, []),
  );

  const budgetItems = React.useMemo((): CategorySpendRow[] => {
    const knownIds = new Set(categories.map((c) => c.id));
    const rows: CategorySpendRow[] = categories.map((category) => ({
      id: category.id,
      name: category.name,
      icon_name: category.icon_name,
      color: category.color,
      spentMonth: spendByCategory[category.id] ?? 0,
    }));

    const uncategorizedSpent = spendByCategory[UNCATEGORIZED_SPEND_KEY] ?? 0;
    if (uncategorizedSpent > 0) {
      rows.push({
        id: UNCATEGORIZED_SPEND_KEY,
        name: "Uncategorized",
        icon_name: "Package",
        color: FALLBACK_CATEGORY_COLOR,
        spentMonth: uncategorizedSpent,
      });
    }

    for (const [categoryId, amount] of Object.entries(spendByCategory)) {
      if (categoryId === UNCATEGORIZED_SPEND_KEY || amount <= 0) {
        continue;
      }
      if (!knownIds.has(categoryId)) {
        rows.push({
          id: categoryId,
          name: "Unknown category",
          icon_name: "Package",
          color: FALLBACK_CATEGORY_COLOR,
          spentMonth: amount,
        });
      }
    }

    return rows.sort(
      (a, b) => b.spentMonth - a.spentMonth || a.name.localeCompare(b.name),
    );
  }, [categories, spendByCategory]);

  const handleSelectBudgetMonth = useCallback((index: number) => {
    setSelectedMonthIndex(index);
  }, []);

  const resetEditorToExisting = React.useCallback(() => {
    if (hasMonthlyBudget) {
      setMonthlyBudgetText(String(Math.round(existingBudget)));
      return;
    }
    setMonthlyBudgetText("");
  }, [existingBudget, hasMonthlyBudget]);

  const handleCancelBudgetEdit = React.useCallback(() => {
    resetEditorToExisting();
    setIsEditOpen(false);
  }, [resetEditorToExisting]);

  const handleSaveMonthlyBudget = React.useCallback(() => {
    const parsed = Number.parseFloat(monthlyBudgetText);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }

    if (hasMonthlyBudget && Math.abs(parsed - existingBudget) < 0.0001) {
      setIsEditOpen(false);
      return;
    }

    upsertBudgetMutation.mutate({ amount: parsed });
  }, [
    existingBudget,
    hasMonthlyBudget,
    monthlyBudgetText,
    upsertBudgetMutation,
  ]);

  const monthlyBudgetAmount = hasMonthlyBudget ? existingBudget : 0;
  const spentMonthNum = monthSummaryQuery.data
    ? Math.abs(Number.parseFloat(monthSummaryQuery.data.debit_total))
    : Number.NaN;
  const hasSpentMonth = Number.isFinite(spentMonthNum);
  const monthSummaryFailed = monthSummaryQuery.isError;
  const monthlyBudgetRemaining =
    hasMonthlyBudget && hasSpentMonth && !monthSummaryFailed
      ? Math.max(0, monthlyBudgetAmount - spentMonthNum)
      : 0;
  const monthlyBudgetPct =
    hasMonthlyBudget &&
    hasSpentMonth &&
    !monthSummaryFailed &&
    monthlyBudgetAmount > 0
      ? Math.min(1, spentMonthNum / monthlyBudgetAmount)
      : 0;
  const monthlyHeroSubtext = monthSummaryFailed
    ? "Could not load spending for this month."
    : hasMonthlyBudget && hasSpentMonth
      ? `${formatInrCompact(monthlyBudgetRemaining)} left from ${formatInrCompact(monthlyBudgetAmount)}`
      : hasMonthlyBudget
        ? ""
        : "";
  const showMonthlyHeroProgress =
    hasMonthlyBudget && hasSpentMonth && !monthSummaryFailed;
  const isHeroAmountLoading =
    hasMonthlyBudget && (isBudgetLoading || monthSummaryQuery.isPending);

  const daysInMonth = getDaysInMonth(new Date());
  const dailyLimitFromText = monthlyBudgetText
    ? Number.parseFloat(monthlyBudgetText)
    : 0;
  const dailyLimitAmount =
    Number.isFinite(dailyLimitFromText) && dailyLimitFromText > 0
      ? Math.round(dailyLimitFromText / daysInMonth)
      : 0;
  const dailyLimitDisplay = dailyLimitAmount > 0 ? `₹${dailyLimitAmount}` : "-";

  const shouldShowEditor = !hasMonthlyBudget || isEditOpen;

  const renderCategory = useCallback(
    ({ item }: { item: CategorySpendRow }) => {
      const shareOfMonthlyCap =
        hasMonthlyBudget && monthlyBudgetAmount > 0
          ? Math.min(1, item.spentMonth / monthlyBudgetAmount)
          : 0;
      return (
        <View style={styles.categoryRow}>
          <View style={styles.catLeft}>
            <View
              style={[styles.catTile, { backgroundColor: `${item.color}22` }]}
            >
              <CategoryLucideIcon
                iconName={item.icon_name}
                color={item.color}
                size={18}
                strokeWidth={1.5}
              />
            </View>
            <View style={styles.catMeta}>
              <Text style={styles.catName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.catBudgetText}>
                {hasMonthlyBudget
                  ? "Share of monthly budget"
                  : "Spent this month"}
              </Text>
            </View>
          </View>
          <View style={styles.catRight}>
            <Text style={styles.catSpent}>
              {formatInrCompact(item.spentMonth)}
            </Text>
            <View style={styles.catProgressWrap}>
              <AnimatedProgressBar
                progress={shareOfMonthlyCap}
                fillColor={item.color}
                backgroundColor={`${item.color}14`}
                height={8}
                duration={700}
              />
            </View>
          </View>
        </View>
      );
    },
    [hasMonthlyBudget, monthlyBudgetAmount],
  );

  const listHeader = (
    <>
      {shouldShowEditor ? (
        <View style={styles.editorCard}>
          <Text style={styles.editorLabel}>
            {hasMonthlyBudget ? "Update budget" : "Monthly budget"}
          </Text>
          <Text style={styles.editorDescription}>
            Set the monthly budget that works for you.
          </Text>
          <View style={[styles.amountShell, styles.amountShellMin]}>
            <View style={styles.currencyPrefixWrap}>
              <Text style={styles.currencyPrefix}>₹</Text>
            </View>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor={colors.inactive}
              keyboardType="decimal-pad"
              value={monthlyBudgetText}
              onChangeText={setMonthlyBudgetText}
              underlineColorAndroid="transparent"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSaveMonthlyBudget}
            />
          </View>
          <View style={styles.editorActionsRow}>
            <View style={styles.actionButtonWrap}>
              <Button
                title="Update"
                loading={upsertBudgetMutation.isPending}
                onPress={handleSaveMonthlyBudget}
                disabled={isBudgetLoading}
              />
            </View>
            {hasMonthlyBudget ? (
              <View style={styles.actionButtonWrap}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={handleCancelBudgetEdit}
                />
              </View>
            ) : null}
          </View>
          <View style={styles.dailyLimitSection}>
            <TextField
              label="Daily limit"
              value={dailyLimitDisplay}
              editable={false}
              showClear={false}
            />
          </View>
        </View>
      ) : null}

      {hasMonthlyBudget ? (
        <HeroSummaryCard
          title="Monthly Budget"
          date=""
          headerRight={
            <View style={styles.monthDropdownWrap}>
              <SelectDropdown
                options={monthOptions.map((month) => ({
                  label: month.label,
                  value: month.label,
                }))}
                value={selected.label}
                onChange={(next) => {
                  const index = monthOptions.findIndex(
                    (month) => month.label === next,
                  );
                  if (index >= 0) {
                    handleSelectBudgetMonth(index);
                  }
                }}
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
          isAmountLoading={isHeroAmountLoading}
          amountSpinnerTone="white"
          amountAccessory={
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsEditOpen(true)}
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

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>All categories</Text>
      </View>
    </>
  );

  return (
    <TabScreenShell>
      <FlashList
        style={styles.list}
        data={budgetItems}
        keyExtractor={(i) => i.id}
        renderItem={renderCategory}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={() => (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              {loading
                ? "Loading categories..."
                : "No categories yet. Sync categories to see budgets."}
            </Text>
          </View>
        )}
        ListHeaderComponent={listHeader}
        ListFooterComponent={() => <View style={{ height: spacing.xl }} />}
      />
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  list: {
    flex: 1,
  },
  monthDropdownWrap: {
    position: "relative",
    zIndex: 5,
  },
  editorCard: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  editorLabel: {
    fontFamily: typography.headerUsernameLine.fontFamily,
    fontSize: 16,
    color: colors.textPrimary,
  },
  editorDescription: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    fontFamily: typography.screenSubtitle.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  editorActionsRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    gap: spacing.md,
  },
  actionButtonWrap: {
    flex: 1,
  },
  dailyLimitSection: {
    marginTop: spacing.md,
  },
  amountShell: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.pageBackground,
  },
  amountShellMin: {
    minHeight: 52,
  },
  currencyPrefixWrap: {
    marginRight: spacing.xs,
    justifyContent: "center",
    ...Platform.select({
      android: { height: 26 },
    }),
  },
  currencyPrefix: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 24,
    color: colors.textPrimary,
    ...Platform.select({
      android: {
        includeFontPadding: false,
        lineHeight: 26,
      },
      default: {
        lineHeight: 30,
      },
    }),
  },
  amountInput: {
    flex: 1,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 24,
    color: colors.textPrimary,
    padding: 0,
    margin: 0,
    ...Platform.select({
      android: {
        height: "100%",
        paddingVertical: 0,
        includeFontPadding: false,
        textAlignVertical: "center",
        lineHeight: 26,
      },
      ios: {
        lineHeight: 30,
        paddingVertical: 2,
      },
    }),
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
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  catLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  catTile: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  catMeta: { marginLeft: spacing.sm, flex: 1, minWidth: 0 },
  catName: {
    fontFamily: typography.headerUsernameLine.fontFamily,
    fontSize: 15,
    color: colors.textPrimary,
  },
  catBudgetText: {
    fontFamily: typography.screenSubtitle.fontFamily,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  catRight: { width: 120, alignItems: "flex-end" },
  catSpent: {
    fontFamily: typography.monoEmphasis.fontFamily,
    fontSize: 15,
    color: colors.textPrimary,
  },
  catProgressWrap: { marginTop: spacing.xs, width: "100%" },
  separator: { height: spacing.md },
  emptyWrap: { paddingVertical: spacing.md, alignItems: "center" },
  emptyText: {
    fontFamily: typography.screenSubtitle.fontFamily,
    color: colors.textSecondary,
  },
  editBudgetButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  editBudgetButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
});
