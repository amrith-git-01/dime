import React from "react";
import {
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    View
} from "react-native";

import { HeroSummaryCard } from "@/components/home/HeroSummaryCard";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { AnimatedProgressBar } from "@/components/ui/AnimatedProgressBar";
import { colors, spacing, typography } from "@/constants/theme";

type CategoryMock = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  budget: number;
  spent: number;
};

const MOCK_TOTAL_BUDGET = 25000;
const MOCK_SPENT = 6420;

const MOCK_CATEGORIES: CategoryMock[] = [
  { id: "c1", name: "Groceries", emoji: "🛒", color: "#FF8A65", budget: 6000, spent: 3240 },
  { id: "c2", name: "Transport", emoji: "🚗", color: "#4FC3F7", budget: 3000, spent: 890 },
  { id: "c3", name: "Dining Out", emoji: "🍽️", color: "#FFB74D", budget: 2000, spent: 540 },
  { id: "c4", name: "Bills", emoji: "💡", color: "#9575CD", budget: 4000, spent: 920 },
  { id: "c5", name: "Entertainment", emoji: "🎬", color: "#F06292", budget: 1500, spent: 830 },
];

export default function BudgetScreen() {
  const totalBudget = MOCK_TOTAL_BUDGET;
  const spent = MOCK_SPENT;
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
      <ScrollView contentContainerStyle={styles.content}>
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
          <Text style={styles.sectionTitle}>Category budgets</Text>
        </View>

        <View style={styles.listCard}>
          <FlatList
            data={MOCK_CATEGORIES}
            keyExtractor={(i) => i.id}
            renderItem={renderCategory}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={() => (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No category budgets yet.</Text>
              </View>
            )}
          />
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
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
