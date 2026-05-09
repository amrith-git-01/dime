import {
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import { HeroSummaryCard } from "@/components/home/HeroSummaryCard";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { AnimatedProgressBar } from "@/components/ui/AnimatedProgressBar";
import { colors, spacing, typography } from "@/constants/theme";

const topCategories = [
  {
    id: "food",
    label: "Food",
    amount: "₹1,850",
    progress: 0.92,
    color: "#FF6B6B",
    muted: "rgba(255,107,107,0.18)",
  },
  {
    id: "transport",
    label: "Transport",
    amount: "₹940",
    progress: 0.62,
    color: "#4ECDC4",
    muted: "rgba(78,205,196,0.18)",
  },
  {
    id: "shopping",
    label: "Shopping",
    amount: "₹720",
    progress: 0.47,
    color: "#A855F7",
    muted: "rgba(168,85,247,0.18)",
  },
] as const;

const recentTransactions = [
  { id: "r1", merchant: "Swiggy", meta: "9:14 PM · UPI", amount: "-₹329" },
  { id: "r2", merchant: "Uber", meta: "7:58 PM · UPI", amount: "-₹188" },
  { id: "r3", merchant: "Amazon", meta: "4:22 PM · UPI", amount: "-₹699" },
  { id: "r4", merchant: "Metro", meta: "11:07 AM · Card", amount: "-₹50" },
  { id: "r5", merchant: "Refund", meta: "10:44 AM · UPI", amount: "+₹120" },
] as const;

export default function HomeScreen() {
  return (
    <TabScreenShell>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <HeroSummaryCard
          title="Spent Today"
          date="23 Feb"
          amount="₹1,262"
          subtext="82% of Daily budget"
        />

        <HeroSummaryCard
          title="Spent Monthly"
          date="July 2026"
          amount="₹18,420"
          subtext="73% of Monthly budget"
        />

        {/* Top Categories */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Top categories</Text>
          {topCategories.map((item) => (
            <View key={item.id} style={styles.categoryRow}>
              <View style={styles.categoryHeaderRow}>
                <Text style={styles.categoryLabel}>{item.label}</Text>
                <Text style={styles.categoryAmount}>{item.amount}</Text>
              </View>
              <AnimatedProgressBar
                progress={item.progress}
                fillColor={item.color}
                backgroundColor={item.muted}
                height={8}
                duration={800}
              />
            </View>
          ))}
        </View>

        {/* Recent Transactions */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Recent transactions</Text>
            <Text style={styles.seeAll}>See all</Text>
          </View>
          {recentTransactions.map((tx) => (
            <View key={tx.id} style={styles.recentRow}>
              <View style={styles.recentMetaCol}>
                <Text style={styles.recentMerchant}>{tx.merchant}</Text>
                <Text style={styles.recentMeta}>{tx.meta}</Text>
              </View>
              <Text
                style={[
                  styles.recentAmount,
                  tx.amount.startsWith("+") && styles.creditAmount,
                  tx.amount.startsWith("-") && styles.debitAmount,
                ]}
              >
                {tx.amount}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.barBackground,
    borderRadius: 20,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sectionTitle: {
    ...typography.monoEmphasis,
    fontFamily: typography.screenTitle.fontFamily,
    fontSize: 17,
    lineHeight: 24,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  categoryRow: {
    marginBottom: spacing.sm,
  },
  categoryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  categoryLabel: {
    ...typography.screenSubtitle,
    color: colors.textPrimary,
  },
  categoryAmount: {
    ...typography.mono,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  seeAll: {
    color: colors.primary,
    ...typography.tabLabel,
    fontFamily: typography.headerUsernameLine.fontFamily,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  recentMetaCol: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  recentMerchant: {
    ...typography.screenSubtitle,
    color: colors.textPrimary,
    fontFamily: typography.headerUsernameLine.fontFamily,
  },
  recentMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  recentAmount: {
    ...typography.mono,
    fontSize: 14,
    lineHeight: 20,
  },
  creditAmount: {
    color: "#16A34A",
  },
  debitAmount: {
    color: "#DC2626",
  },
});
