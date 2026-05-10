import React from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View
} from "react-native";

import { HeroSummaryCard } from "@/components/home/HeroSummaryCard";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { AnimatedProgressBar } from "@/components/ui/AnimatedProgressBar";
import { colors, spacing, typography } from "@/constants/theme";
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

function toCategoryBudget(item: { id: string; name: string; emoji: string; color: string }, index: number): CategoryMock {
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
  const budgetItems = React.useMemo(
    () => categories.map((category, index) => toCategoryBudget(category, index)),
    [categories],
  );

  const totalBudget = budgetItems.reduce((sum, item) => sum + item.budget, 0);
  const spent = budgetItems.reduce((sum, item) => sum + item.spent, 0);
  const remaining = Math.max(0, totalBudget - spent);
  const pct = totalBudget > 0 ? Math.round((spent / totalBudget) * 100) : 0;

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
            <Text style={styles.catBudgetText}>Budget • ₹{item.budget}</Text>
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
              {loading ? "Loading categories…" : "No categories yet. Sync categories to see budgets."}
            </Text>
          </View>
        )}
        ListHeaderComponent={() => (
          <>
            <View style={styles.headerRow}>
              <Text style={styles.screenTitle}>Budgets</Text>
            </View>

            <HeroSummaryCard
              title="Monthly Budget"
              date="This month"
              amount={`₹${spent}`}
              subtext={`₹${remaining} left of ₹${totalBudget}`}
              progress={Math.min(1, spent / Math.max(1, totalBudget))}
              progressLabel={`${pct}% used`}
            />

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>All categories</Text>
            </View>
          </>
        )}
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
  headerRow: {
    marginBottom: spacing.md,
  },
  screenTitle: {
    fontFamily: typography.headerUsernameLine.fontFamily,
    fontSize: 20,
    color: colors.textPrimary,
  },
  sectionHeader: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: typography.screenSubtitle.fontFamily,
    fontSize: 14,
    color: colors.textSecondary,
  },
  listCard: {
    marginTop: spacing.sm,
    borderRadius: 14,
    padding: spacing.md,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
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
});
