import { useFocusEffect } from "@react-navigation/native";
import { getDaysInMonth } from "date-fns";
import { Edit3 } from "lucide-react-native";
import React from "react";
import {
  FlatList,
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
import { TextField } from "@/components/ui/TextField/TextField";
import { fontFamilies } from "@/constants/fonts";
import { colors, spacing, typography } from "@/constants/theme";
import {
  useBudgetQuery,
  useUpsertBudgetMutation,
} from "@/features/budgets/hooks/useBudget";
import { useLocalCategories } from "@/features/categories/hooks/useLocalCategories";

type CategoryMock = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  budget: number;
  spent: number;
};

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function toCategoryBudget(
  item: { id: string; name: string; emoji: string; color: string },
  index: number,
): CategoryMock {
  const seed = hashString(item.id || item.name || String(index));
  const budget = 1800 + (seed % 5200) + (index % 3) * 250;
  const spendRatio = 0.18 + ((seed >> 3) % 45) / 100;
  const spent = Math.min(budget, Math.max(0, Math.round(budget * spendRatio)));

  return {
    id: item.id,
    name: item.name,
    emoji: item.emoji,
    color: item.color,
    budget,
    spent,
  };
}

export default function BudgetScreen() {
  const { data: categories, loading } = useLocalCategories();
  const { data: budgetResp, isPending: isBudgetLoading } = useBudgetQuery();
  const upsertBudgetMutation = useUpsertBudgetMutation();

  const existingBudget = budgetResp?.budget
    ? Number.parseFloat(budgetResp.budget.monthly_budget)
    : 0;
  const hasMonthlyBudget = Number.isFinite(existingBudget) && existingBudget > 0;

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

  const budgetItems = React.useMemo(() => {
    const items = categories.map((category, index) => toCategoryBudget(category, index));
    return items.slice().sort((a, b) => b.budget - a.budget);
  }, [categories]);

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
  }, [existingBudget, hasMonthlyBudget, monthlyBudgetText, upsertBudgetMutation]);

  const totalBudget = budgetItems.reduce((sum, item) => sum + item.budget, 0);
  const spent = budgetItems.reduce((sum, item) => sum + item.spent, 0);
  const monthlyBudgetAmount = hasMonthlyBudget ? existingBudget : totalBudget;
  const monthlyBudgetRemaining = Math.max(0, monthlyBudgetAmount - spent);
  const monthlyBudgetPct = monthlyBudgetAmount > 0 ? Math.min(1, spent / monthlyBudgetAmount) : 0;

  const daysInMonth = getDaysInMonth(new Date());
  const dailyLimitFromText = monthlyBudgetText ? Number.parseFloat(monthlyBudgetText) : 0;
  const dailyLimitAmount =
    Number.isFinite(dailyLimitFromText) && dailyLimitFromText > 0
      ? Math.round(dailyLimitFromText / daysInMonth)
      : 0;
  const dailyLimitDisplay = dailyLimitAmount > 0 ? `₹${dailyLimitAmount}` : "-";

  const shouldShowEditor = !hasMonthlyBudget || isEditOpen;

  const renderCategory = ({ item }: { item: CategoryMock }) => {
    const progress = item.budget > 0 ? Math.min(1, item.spent / item.budget) : 0;
    return (
      <View style={styles.categoryRow}>
        <View style={styles.catLeft}>
          <View style={[styles.catTile, { backgroundColor: `${item.color}22` }]}>
            <Text style={styles.catEmoji}>{item.emoji}</Text>
          </View>
          <View style={styles.catMeta}>
            <Text style={styles.catName}>{item.name}</Text>
            <Text style={styles.catBudgetText}>Budget - ₹{item.budget}</Text>
          </View>
        </View>
        <View style={styles.catRight}>
          <Text style={styles.catSpent}>₹{item.spent}</Text>
          <View style={styles.catProgressWrap}>
            <AnimatedProgressBar
              progress={progress}
              fillColor={item.color}
              backgroundColor={`${item.color}14`}
              height={8}
              duration={700}
            />
          </View>
        </View>
      </View>
    );
  };

  const listHeader = (
    <>
      {shouldShowEditor ? (
        <View style={styles.editorCard}>
          <Text style={styles.editorLabel}>{hasMonthlyBudget ? "Update budget" : "Monthly budget"}</Text>
          <Text style={styles.editorDescription}>Set the monthly budget that works for you.</Text>
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
          date="This month"
          amount={`₹${Math.round(monthlyBudgetAmount)}`}
          subtext={`₹${Math.round(monthlyBudgetRemaining)} left of ₹${Math.round(monthlyBudgetAmount)}`}
          progress={monthlyBudgetPct}
          progressLabel={`${Math.round(monthlyBudgetPct * 100)}% used`}
          showProgress
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
      <FlatList
        data={budgetItems}
        keyExtractor={(i) => i.id}
        renderItem={renderCategory}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={() => (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              {loading ? "Loading categories..." : "No categories yet. Sync categories to see budgets."}
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
  catLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  catTile: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  catEmoji: { fontSize: 20 },
  catMeta: { marginLeft: spacing.sm, flex: 1, minWidth: 0 },
  catName: { fontFamily: typography.headerUsernameLine.fontFamily, fontSize: 15, color: colors.textPrimary },
  catBudgetText: { fontFamily: typography.screenSubtitle.fontFamily, fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  catRight: { width: 120, alignItems: "flex-end" },
  catSpent: { fontFamily: typography.monoEmphasis.fontFamily, fontSize: 15, color: colors.textPrimary },
  catProgressWrap: { marginTop: spacing.xs, width: "100%" },
  separator: { height: spacing.md },
  emptyWrap: { paddingVertical: spacing.md, alignItems: "center" },
  emptyText: { fontFamily: typography.screenSubtitle.fontFamily, color: colors.textSecondary },
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
