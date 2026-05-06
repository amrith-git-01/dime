import { ScrollView, StyleSheet, Text, View } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
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

const progressMutedFill = (muted: string) => ({
  ...StyleSheet.absoluteFillObject,
  backgroundColor: muted,
  borderRadius: 999,
});

const progressFill = (fill: string, progress: number) => ({
  height: "100%" as const,
  borderRadius: 999,
  width: `${progress * 100}%`,
  backgroundColor: fill,
});

export default function HomeScreen() {
  return (
    <TabScreenShell>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, styles.heroCard]}>
          <Text style={styles.heroKicker}>Today's spent</Text>
          <Text style={styles.heroAmount}>₹1,262</Text>
          <Text style={styles.heroSubtext}>82% of daily target</Text>
          <View style={styles.sparklineRow}>
            <View style={[styles.sparkBar, { height: 10 }]} />
            <View style={[styles.sparkBar, { height: 18 }]} />
            <View style={[styles.sparkBar, { height: 12 }]} />
            <View style={[styles.sparkBar, { height: 24 }]} />
            <View style={[styles.sparkBar, { height: 16 }]} />
            <View style={[styles.sparkBar, { height: 26 }]} />
            <View style={[styles.sparkBar, { height: 20 }]} />
          </View>
        </View>

        <View style={styles.twoColRow}>
          <View style={[styles.card, styles.metricCard]}>
            <Text style={styles.metricLabel}>This month</Text>
            <Text style={styles.metricValue}>₹18,420</Text>
          </View>
          <View style={[styles.card, styles.metricCard]}>
            <Text style={styles.metricLabel}>Budget left</Text>
            <Text style={styles.metricValue}>₹6,580</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Top categories</Text>
          {topCategories.map((item) => (
            <View key={item.id} style={styles.categoryRow}>
              <View style={styles.categoryHeaderRow}>
                <Text style={styles.categoryLabel}>{item.label}</Text>
                <Text style={styles.categoryAmount}>{item.amount}</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={progressMutedFill(item.muted)} />
                <View style={progressFill(item.color, item.progress)} />
              </View>
            </View>
          ))}
        </View>

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
                ]}
              >
                {tx.amount}
              </Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, styles.statusCard]}>
          <View style={styles.statusDot} />
          <View>
            <Text style={styles.statusTitle}>Auto-detection active</Text>
            <Text style={styles.statusSubtext}>SMS / UPI listening</Text>
          </View>
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
  heroCard: {
    backgroundColor: colors.headerGradientStart,
    borderColor: colors.headerGradientEnd,
  },
  heroKicker: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textOnPrimaryMuted,
  },
  heroAmount: {
    fontFamily: typography.monoEmphasis.fontFamily,
    color: colors.textOnPrimary,
    fontSize: 40,
    lineHeight: 48,
    marginTop: spacing.xs,
  },
  heroSubtext: {
    ...typography.screenSubtitle,
    color: colors.textOnPrimaryMuted,
  },
  sparklineRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    marginTop: spacing.md,
    height: 28,
  },
  sparkBar: {
    width: 8,
    borderRadius: 4,
    backgroundColor: colors.textOnPrimaryMuted,
  },
  twoColRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  metricCard: {
    flex: 1,
    marginBottom: 0,
  },
  metricLabel: {
    ...typography.screenSubtitle,
    marginBottom: spacing.xs,
  },
  metricValue: {
    ...typography.monoEmphasis,
    fontSize: 20,
    lineHeight: 28,
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
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#F2F0FF",
    overflow: "hidden",
    position: "relative",
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
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  creditAmount: {
    color: "#16A34A",
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#16A34A",
  },
  statusTitle: {
    ...typography.screenSubtitle,
    color: colors.textPrimary,
    fontFamily: typography.headerUsernameLine.fontFamily,
  },
  statusSubtext: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
});
