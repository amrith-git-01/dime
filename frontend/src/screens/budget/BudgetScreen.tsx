import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { fontFamilies } from "@/constants/fonts";
import { colors, spacing } from "@/constants/theme";
import { BudgetCategoriesSectionHeader } from "@/features/budgets/components/BudgetCategoriesSectionHeader";
import {
  BudgetCategoryRow,
  type BudgetCategoryRowData,
} from "@/features/budgets/components/BudgetCategoryRow";
import { BudgetEditorPanel } from "@/features/budgets/components/BudgetEditorPanel";
import { BudgetListHeader } from "@/features/budgets/components/BudgetListHeader";
import {
  useBudgetQuery,
  useUpsertBudgetMutation,
} from "@/features/budgets/hooks/useBudget";
import { MAX_CUSTOM_CATEGORIES } from "@/features/categories/constants/limits";
import { useLocalCategories } from "@/features/categories/hooks/useLocalCategories";
import { useToast } from "@/features/toast/useToast";
import { formatInrCompact } from "@/features/transactions/formatAmount";
import {
  useMonthDebitTotalsByCategoryQuery,
  useMonthSummaryQuery,
} from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import type { MainStackParamList } from "@/navigation/types";
import { buildMonthOptions } from "@/utils/buildMonthOptions";

const UNCATEGORIZED_SPEND_KEY = "__uncategorized__";
const CategoryListSeparator = memo(function CategoryListSeparator() {
  return <View style={styles.separator} />;
});

type BudgetListEmptyProps = {
  loading: boolean;
};

const BudgetListEmpty = memo(function BudgetListEmpty({
  loading,
}: BudgetListEmptyProps) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyText}>
        {loading
          ? "Loading categories..."
          : "No categories yet. Sync categories to see budgets."}
      </Text>
    </View>
  );
});

const BudgetListFooter = memo(function BudgetListFooter() {
  return <View style={styles.listFooter} />;
});

/** Uniform row height when monthly budget exists (icon row + progress track). */
const BUDGET_ROW_HEIGHT_WITH_PROGRESS = 58;
const BUDGET_ROW_HEIGHT_SPENT_ONLY = 46;
const BUDGET_LIST_DRAW_DISTANCE = Platform.select({
  ios: 280,
  android: 200,
  default: 240,
}) as number;

export default function BudgetScreen() {
  const stackNavigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { showToast } = useToast();
  const listRef = useRef<FlashListRef<BudgetCategoryRowData>>(null);
  const { data: categories, loading: categoriesLoading } = useLocalCategories();
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

  const [monthlyBudgetText, setMonthlyBudgetText] = useState("");
  const [isEditOpen, setIsEditOpen] = useState(false);

  useEffect(() => {
    if (!hasMonthlyBudget) {
      setMonthlyBudgetText("");
      return;
    }
    setMonthlyBudgetText(String(Math.round(existingBudget)));
  }, [existingBudget, hasMonthlyBudget]);

  useEffect(() => {
    if (upsertBudgetMutation.isSuccess) {
      setIsEditOpen(false);
    }
  }, [upsertBudgetMutation.isSuccess]);

  useFocusEffect(
    useCallback(() => {
      return () => setIsEditOpen(false);
    }, []),
  );

  const budgetItems = useMemo((): BudgetCategoryRowData[] => {
    const knownIds = new Set(categories.map((c) => c.id));
    const rows: BudgetCategoryRowData[] = categories.map((category) => ({
      id: category.id,
      name: category.name,
      icon_name: category.icon_name,
      color: category.color,
      spentMonth: spendByCategory[category.id] ?? 0,
      is_system: category.is_system,
    }));

    const uncategorizedSpent = spendByCategory[UNCATEGORIZED_SPEND_KEY] ?? 0;
    if (uncategorizedSpent > 0) {
      rows.push({
        id: UNCATEGORIZED_SPEND_KEY,
        name: "Uncategorized",
        icon_name: "Package",
        color: colors.categoryDefault,
        spentMonth: uncategorizedSpent,
        is_system: true,
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
          color: colors.categoryDefault,
          spentMonth: amount,
          is_system: true,
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

  useEffect(() => {
    listRef.current?.scrollToTop({ animated: false });
  }, [selectedMonthIndex]);

  const resetEditorToExisting = useCallback(() => {
    if (hasMonthlyBudget) {
      setMonthlyBudgetText(String(Math.round(existingBudget)));
      return;
    }
    setMonthlyBudgetText("");
  }, [existingBudget, hasMonthlyBudget]);

  const handleCancelBudgetEdit = useCallback(() => {
    resetEditorToExisting();
    setIsEditOpen(false);
  }, [resetEditorToExisting]);

  const handleOpenBudgetEdit = useCallback(() => {
    setIsEditOpen(true);
  }, []);

  const handleSaveMonthlyBudget = useCallback(() => {
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
  /** Keep progress slot mounted while budget exists so header height does not jump. */
  const showMonthlyHeroProgress = hasMonthlyBudget && !monthSummaryFailed;
  const isHeroAmountLoading =
    hasMonthlyBudget && (isBudgetLoading || monthSummaryQuery.isPending);

  const shouldShowEditor = !hasMonthlyBudget || isEditOpen;

  const renderCategory = useCallback(
    ({ item }: { item: BudgetCategoryRowData }) => (
      <BudgetCategoryRow
        item={item}
        hasMonthlyBudget={hasMonthlyBudget}
        monthlyBudgetAmount={monthlyBudgetAmount}
      />
    ),
    [hasMonthlyBudget, monthlyBudgetAmount],
  );

  const listExtraData = useMemo(
    () => ({
      hasMonthlyBudget,
      monthlyBudgetAmount,
      monthKey: selected.label,
    }),
    [hasMonthlyBudget, monthlyBudgetAmount, selected.label],
  );

  const overrideItemLayout = useCallback(
    (
      layout: { span?: number; size?: number },
      _item: BudgetCategoryRowData,
    ) => {
      layout.size = hasMonthlyBudget
        ? BUDGET_ROW_HEIGHT_WITH_PROGRESS
        : BUDGET_ROW_HEIGHT_SPENT_ONLY;
    },
    [hasMonthlyBudget],
  );

  const categoriesStillLoading = categoriesLoading && categories.length === 0;

  const listEmpty = useMemo(
    () => <BudgetListEmpty loading={categoriesStillLoading} />,
    [categoriesStillLoading],
  );

  const listFooter = useMemo(() => <BudgetListFooter />, []);

  const customCategoryCount = useMemo(
    () => categories.filter((category) => !category.is_system).length,
    [categories],
  );

  const handleAddCustomCategory = useCallback(() => {
    if (customCategoryCount >= MAX_CUSTOM_CATEGORIES) {
      showToast({
        variant: "error",
        message: `Maximum ${MAX_CUSTOM_CATEGORIES} custom categories`,
      });
      return;
    }
    stackNavigation.navigate("CreateCustomCategory", { origin: "budget" });
  }, [customCategoryCount, showToast, stackNavigation]);

  const listSectionHeader = useMemo(
    () => (
      <BudgetCategoriesSectionHeader
        onAddPress={handleAddCustomCategory}
        addDisabled={customCategoryCount >= MAX_CUSTOM_CATEGORIES}
      />
    ),
    [customCategoryCount, handleAddCustomCategory],
  );

  return (
    <TabScreenShell>
      <View style={styles.screen}>
        {shouldShowEditor ? (
          <View style={styles.editorSlot}>
            <BudgetEditorPanel
              hasMonthlyBudget={hasMonthlyBudget}
              monthlyBudgetText={monthlyBudgetText}
              onChangeMonthlyBudgetText={setMonthlyBudgetText}
              onSaveMonthlyBudget={handleSaveMonthlyBudget}
              onCancelBudgetEdit={handleCancelBudgetEdit}
              isBudgetSaving={upsertBudgetMutation.isPending}
              isBudgetLoading={isBudgetLoading}
              selectedYear={selected.year}
              selectedMonthIndex0={selected.monthIndex0}
            />
          </View>
        ) : null}

        {hasMonthlyBudget ? (
          <View style={styles.heroSlot}>
            <BudgetListHeader
              hasMonthlyBudget
              selectedMonthLabel={selected.label}
              monthOptions={monthOptions}
              onSelectBudgetMonth={handleSelectBudgetMonth}
              monthlyBudgetAmount={monthlyBudgetAmount}
              monthlyHeroSubtext={monthlyHeroSubtext}
              monthlyBudgetPct={monthlyBudgetPct}
              showMonthlyHeroProgress={showMonthlyHeroProgress}
              isHeroAmountLoading={isHeroAmountLoading}
              onOpenBudgetEdit={handleOpenBudgetEdit}
              showCategoriesSection={false}
            />
          </View>
        ) : null}

        <FlashList
          ref={listRef}
          style={styles.list}
          data={budgetItems}
          extraData={listExtraData}
          keyExtractor={(item) => item.id}
          renderItem={renderCategory}
          overrideItemLayout={overrideItemLayout}
          drawDistance={BUDGET_LIST_DRAW_DISTANCE}
          contentContainerStyle={styles.content}
          ItemSeparatorComponent={CategoryListSeparator}
          ListEmptyComponent={listEmpty}
          ListHeaderComponent={listSectionHeader}
          ListFooterComponent={listFooter}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  editorSlot: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  heroSlot: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  list: {
    flex: 1,
  },
  listFooter: {
    height: spacing.xl,
  },
  separator: {
    height: spacing.md,
  },
  emptyWrap: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  emptyText: {
    fontFamily: fontFamilies.regular,
    color: colors.textSecondary,
  },
});
