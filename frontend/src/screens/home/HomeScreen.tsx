import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { HeroSummaryCard } from "@/components/home/HeroSummaryCard";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { AnimatedProgressBar } from "@/components/ui/AnimatedProgressBar";
import { colors, spacing, typography } from "@/constants/theme";
import { useLocalCategories } from "@/features/categories/hooks/useLocalCategories";

const topCategories = [
  {
    id: "food",
    label: "Food",
    emoji: "🍔",
    amount: "₹1,850",
    progress: 0.92,
    color: "#FF6B6B",
    muted: "rgba(255,107,107,0.14)",
  },
  {
    id: "transport",
    label: "Transport",
    emoji: "🚗",
    amount: "₹940",
    progress: 0.62,
    color: "#4ECDC4",
    muted: "rgba(78,205,196,0.14)",
  },
  {
    id: "shopping",
    label: "Shopping",
    emoji: "🛍️",
    amount: "₹720",
    progress: 0.47,
    color: "#A855F7",
    muted: "rgba(168,85,247,0.14)",
  },
  {
    id: "bills",
    label: "Bills",
    emoji: "💡",
    amount: "₹510",
    progress: 0.38,
    color: "#FBBF24",
    muted: "rgba(251,191,36,0.16)",
  },
  {
    id: "health",
    label: "Health",
    emoji: "⚕️",
    amount: "₹420",
    progress: 0.28,
    color: "#4ADE80",
    muted: "rgba(74,222,128,0.14)",
  },
] as const;

const recentTransactions = [
  {
    id: "r1",
    merchant: "Swiggy",
    categoryName: "Food",
    meta: "9:14 PM · UPI",
    amount: "-₹329",
  },
  {
    id: "r2",
    merchant: "Uber",
    categoryName: "Transport",
    meta: "7:58 PM · UPI",
    amount: "-₹188",
  },
  {
    id: "r3",
    merchant: "Amazon",
    categoryName: "Shopping",
    meta: "4:22 PM · UPI",
    amount: "-₹699",
  },
  {
    id: "r4",
    merchant: "Metro",
    categoryName: "Transport",
    meta: "11:07 AM · Card",
    amount: "-₹50",
  },
  {
    id: "r5",
    merchant: "Refund",
    categoryName: "Income",
    meta: "10:44 AM · UPI",
    amount: "+₹120",
  },
] as const;

const FALLBACK_CATEGORY_EMOJI: Record<string, string> = {
  food: "🍔",
  groceries: "🛒",
  transport: "🚗",
  shopping: "🛍️",
  bills: "💡",
  entertainment: "🎬",
  health: "⚕️",
  income: "💰",
};

export default function HomeScreen() {
  const { data: localCategories } = useLocalCategories();

  const categoryByName = useMemo(() => {
    return new Map(
      localCategories.map((category) => [
        category.name.trim().toLowerCase(),
        category,
      ]),
    );
  }, [localCategories]);

  return (
    <TabScreenShell>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <HeroSummaryCard
          title="Spent Today"
          date="9 May"
          amount="₹1,262"
          subtext="₹238 left from ₹1,500"
          progress={0.82}
          progressLabel="Daily budget used"
        />

        <HeroSummaryCard
          title="Spent Monthly"
          date="May 2026"
          amount="₹18,420"
          subtext="₹6,580 left from ₹25,000"
          progress={0.73}
          progressLabel="Monthly budget used"
        />

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Top categories</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRail}
        >
          {topCategories.map((item) => (
            <View key={item.id} style={styles.categoryCard}>
              <View style={styles.categoryHeader}>
                <View
                  style={[
                    styles.categoryIconTile,
                    { backgroundColor: item.muted },
                  ]}
                >
                  <Text style={styles.categoryEmoji}>{item.emoji}</Text>
                </View>
              </View>
              <Text style={styles.categoryName}>{item.label}</Text>
              <Text style={styles.categoryAmount}>{item.amount}</Text>
              <View style={styles.categoryProgressWrap}>
                <AnimatedProgressBar
                  progress={item.progress}
                  fillColor={item.color}
                  backgroundColor={item.muted}
                  height={7}
                  duration={800}
                />
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
          </View>
        </View>

        <View style={styles.recentCard}>
          {recentTransactions.map((tx) => {
            const category =
              categoryByName.get(tx.categoryName.trim().toLowerCase()) ?? null;
            const isCredit = tx.amount.startsWith("+");
            const categoryColor =
              category?.color ??
              (isCredit ? "rgba(22,163,74,0.14)" : "rgba(99,85,232,0.14)");
            const categoryEmoji =
              category?.emoji ??
              FALLBACK_CATEGORY_EMOJI[tx.categoryName.trim().toLowerCase()] ??
              "💳";

            return (
              <View key={tx.id} style={styles.recentRow}>
                <View
                  style={[
                    styles.recentIconTile,
                    { backgroundColor: categoryColor },
                  ]}
                >
                  <Text style={styles.recentIconEmoji}>{categoryEmoji}</Text>
                </View>
                <View style={styles.recentMetaCol}>
                  <Text style={styles.recentMerchant} numberOfLines={1}>
                    {tx.merchant}
                  </Text>
                  <Text style={styles.recentMeta} numberOfLines={1}>
                    {tx.categoryName} · {tx.meta}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.recentAmount,
                    isCredit ? styles.creditAmount : styles.debitAmount,
                  ]}
                >
                  {tx.amount}
                </Text>
              </View>
            );
          })}
        </View>
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontFamily: typography.headerUsernameLine.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  categoryRail: {
    gap: spacing.md,
    paddingRight: spacing.lg,
    paddingBottom: spacing.xl,
  },
  categoryCard: {
    width: 152,
    minHeight: 158,
    padding: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  categoryIconTile: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryEmoji: {
    fontSize: 19,
  },
  categoryName: {
    fontFamily: typography.headerUsernameLine.fontFamily,
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
  },
  categoryAmount: {
    marginTop: 3,
    fontFamily: typography.monoEmphasis.fontFamily,
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
  },
  categoryProgressWrap: {
    marginTop: spacing.lg,
  },
  recentCard: {
    padding: spacing.xl,
    borderRadius: 20,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 76,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  recentIconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  recentIconEmoji: {
    fontSize: 18,
  },
  recentMetaCol: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing.md,
  },
  recentMerchant: {
    fontFamily: typography.headerUsernameLine.fontFamily,
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
  },
  recentMeta: {
    marginTop: 2,
    fontFamily: typography.screenTitle.fontFamily,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  recentAmount: {
    minWidth: 84,
    textAlign: "right",
    fontFamily: typography.monoEmphasis.fontFamily,
    fontSize: 14,
    lineHeight: 20,
  },
  creditAmount: {
    color: colors.success,
  },
  debitAmount: {
    color: "#DC2626",
  },
});
