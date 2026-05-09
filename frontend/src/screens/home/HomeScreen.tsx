import { format } from "date-fns";
import { useMemo } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { HeroSummaryCard } from "@/components/home/HeroSummaryCard";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { AnimatedProgressBar } from "@/components/ui/AnimatedProgressBar";
import { colors, spacing, typography } from "@/constants/theme";
import { TransactionList } from "@/features/transactions/components/TransactionList";
import { formatInrCompact } from "@/features/transactions/formatAmount";
import { useTransactionsHomeQuery } from "@/features/transactions/hooks/useTransactionsOverviewQueries";

/** Hero / category rails: magnitude only, no leading minus. */
function formatInrSpendMagnitude(amount: string | number): string {
  const n = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(n)) {
    return formatInrCompact(0);
  }
  return formatInrCompact(Math.abs(n));
}

export default function HomeScreen() {
  const { data: overview, isPending, isError } = useTransactionsHomeQuery();

  const spentTodayDisplay = overview
    ? formatInrSpendMagnitude(overview.spent_today)
    : "—";
  const spentMonthDisplay = overview
    ? formatInrSpendMagnitude(overview.spent_this_month)
    : "—";

  const monthLabel = format(new Date(), "MMM yyyy");
  const dayLabel = format(new Date(), "d MMM");

  const topCategoriesUi = useMemo(() => {
    if (!overview?.top_categories?.length) {
      return [];
    }
    const monthTotal = Number.parseFloat(overview.spent_this_month);
    const denom =
      Number.isFinite(monthTotal) && monthTotal > 0 ? monthTotal : 1;
    return overview.top_categories.map((row, index) => {
      const totalNum = Number.parseFloat(row.total);
      const progress = Number.isFinite(totalNum)
        ? Math.min(1, totalNum / denom)
        : 0;
      const color = row.color ?? "#94A3B8";
      const muted = row.color ? `${row.color}24` : "rgba(148,163,184,0.14)";
      return {
        id: row.category_id ?? `uncategorized-${index}`,
        label: row.name,
        emoji: row.emoji ?? "📦",
        amount: formatInrSpendMagnitude(row.total),
        progress,
        color,
        muted,
      };
    });
  }, [overview]);

  return (
    <TabScreenShell>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {isPending ? (
          <View style={styles.loadingBanner}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}
        {isError ? (
          <Text style={styles.errorText}>
            Could not load spending overview.
          </Text>
        ) : null}

        <HeroSummaryCard
          title="Spent Today"
          date={dayLabel}
          amount={spentTodayDisplay}
          subtext="₹238 left from ₹1,500"
          progress={0.82}
          progressLabel="Daily budget used"
        />

        <HeroSummaryCard
          title="Spent Monthly"
          date={monthLabel}
          amount={spentMonthDisplay}
          subtext="₹6,580 left from ₹25,000"
          progress={0.73}
          progressLabel="Monthly budget used"
        />

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Top categories</Text>
          </View>
        </View>

        {topCategoriesUi.length === 0 && !isPending && !isError ? (
          <Text style={styles.emptyInline}>
            No category spending this month yet.
          </Text>
        ) : null}
        {topCategoriesUi.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRail}
          >
            {topCategoriesUi.map((item) => (
              <View key={item.id} style={styles.categoryCard}>
                <View style={styles.categoryCardBody}>
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
                  <Text style={styles.categoryName} numberOfLines={2}>
                    {item.label}
                  </Text>
                  <Text style={styles.categoryAmount}>{item.amount}</Text>
                </View>
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
        ) : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
          </View>
        </View>

        <View style={styles.recentCard}>
          {!overview?.recent_transactions?.length && !isPending && !isError ? (
            <Text style={styles.emptyInline}>No transactions yet.</Text>
          ) : null}
          <TransactionList
            items={overview?.recent_transactions ?? []}
            variant="card"
          />
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
  loadingBanner: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  errorText: {
    fontFamily: typography.screenTitle.fontFamily,
    color: "#DC2626",
    marginBottom: spacing.md,
  },
  emptyInline: {
    fontFamily: typography.screenTitle.fontFamily,
    color: colors.textSecondary,
    paddingVertical: spacing.md,
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
    minHeight: 186,
    padding: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    justifyContent: "space-between",
  },
  categoryCardBody: {
    flexGrow: 1,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
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
    minHeight: 40,
  },
  categoryAmount: {
    marginTop: spacing.xs,
    fontFamily: typography.monoEmphasis.fontFamily,
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    minHeight: 20,
  },
  categoryProgressWrap: {
    marginTop: spacing.md,
    width: "100%",
  },
  recentCard: {
    padding: spacing.xl,
    borderRadius: 20,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
});
