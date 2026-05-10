import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { format } from "date-fns";
import { ChevronRight, Mic, Plus, ReceiptText } from "lucide-react-native";
import { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { MainTabParamList } from "@/navigation/types";

import { HeroSummaryCard } from "@/components/home/HeroSummaryCard";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { AnimatedProgressBar } from "@/components/ui/AnimatedProgressBar";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { colors, spacing, typography } from "@/constants/theme";
import { TransactionList } from "@/features/transactions/components/TransactionList";
import { TransactionListSkeleton } from "@/features/transactions/components/TransactionListSkeleton";
import { formatInrCompact } from "@/features/transactions/formatAmount";
import { useReceiptCameraTransaction } from "@/features/transactions/hooks/useReceiptCameraTransaction";
import { useTransactionsHomeQuery } from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import { useManualAddTransactionUiStore } from "@/stores/manualAddTransactionUiStore";
import { useVoiceCaptureUiStore } from "@/stores/voiceCaptureUiStore";

/** Hero / category rails: magnitude only, no leading minus. */
function formatInrSpendMagnitude(amount: string | number): string {
  const n = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(n)) {
    return formatInrCompact(0);
  }
  return formatInrCompact(Math.abs(n));
}

export default function HomeScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { data: overview, isPending, isError } = useTransactionsHomeQuery();
  const openManualAdd = useManualAddTransactionUiStore((s) => s.open);
  const openVoiceCapture = useVoiceCaptureUiStore((s) => s.open);
  const openReceiptCamera = useReceiptCameraTransaction();

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
    return overview.top_categories.slice(0, 5).map((row, index) => {
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
          isAmountLoading={isPending}
          amountSpinnerTone="white"
        />

        <HeroSummaryCard
          title="Spent Monthly"
          date={monthLabel}
          amount={spentMonthDisplay}
          subtext="₹6,580 left from ₹25,000"
          progress={0.73}
          progressLabel="Monthly budget used"
          isAmountLoading={isPending}
          amountSpinnerTone="white"
        />

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Top categories</Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate("Budgets")}
            style={({ pressed }) => [
              styles.viewAllButton,
              pressed && styles.viewAllButtonPressed,
            ]}
          >
            <Text style={styles.viewAllText}>View All</Text>
            <ChevronRight size={16} color={colors.primary} strokeWidth={2} />
          </Pressable>
        </View>

        {isPending ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRail}
          >
            {Array.from({ length: 5 }).map((_, index) => (
              <View key={`category-skeleton-${index}`} style={styles.categoryCard}>
                <View style={styles.categoryCardBody}>
                  <View style={styles.categoryHeader}>
                    <SkeletonBlock
                      tone="surface"
                      style={styles.categoryIconSkeleton}
                    />
                  </View>
                  <SkeletonBlock
                    tone="surface"
                    style={styles.categoryTitleSkeleton}
                  />
                  <SkeletonBlock
                    tone="surface"
                    style={styles.categoryAmountSkeleton}
                  />
                </View>
                <SkeletonBlock
                  tone="surface"
                  style={styles.categoryProgressSkeleton}
                />
              </View>
            ))}
          </ScrollView>
        ) : null}

        {!isPending && topCategoriesUi.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>No transactions yet.</Text>
            <View style={styles.miniFabRow}>
              <Pressable
                accessibilityRole="button"
                onPress={openManualAdd}
                style={({ pressed }) => [
                  styles.miniFab,
                  pressed && styles.miniFabPressed,
                ]}
              >
                <Plus size={16} color={colors.textOnPrimary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void openReceiptCamera()}
                style={({ pressed }) => [
                  styles.miniFab,
                  pressed && styles.miniFabPressed,
                ]}
              >
                <ReceiptText size={16} color={colors.textOnPrimary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={openVoiceCapture}
                style={({ pressed }) => [
                  styles.miniFab,
                  pressed && styles.miniFabPressed,
                ]}
              >
                <Mic size={16} color={colors.textOnPrimary} />
              </Pressable>
            </View>
          </View>
        ) : null}

        {!isPending && topCategoriesUi.length > 0 ? (
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
          <Pressable
            onPress={() => navigation.navigate("Transactions")}
            style={({ pressed }) => [
              styles.viewAllButton,
              pressed && styles.viewAllButtonPressed,
            ]}
          >
            <Text style={styles.viewAllText}>View All</Text>
            <ChevronRight size={16} color={colors.primary} strokeWidth={2} />
          </Pressable>
        </View>

        <View style={styles.recentCard}>
          {isPending ? (
            <TransactionListSkeleton count={5} variant="card" />
          ) : (
            <>
              {!overview?.recent_transactions?.length && !isError ? (
                <View style={styles.emptyCardInlineWrap}>
                  <Text style={styles.emptyCardText}>No transactions yet.</Text>
                  <View style={styles.miniFabRow}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={openManualAdd}
                      style={({ pressed }) => [
                        styles.miniFab,
                        pressed && styles.miniFabPressed,
                      ]}
                    >
                      <Plus size={16} color={colors.textOnPrimary} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void openReceiptCamera()}
                      style={({ pressed }) => [
                        styles.miniFab,
                        pressed && styles.miniFabPressed,
                      ]}
                    >
                      <ReceiptText size={16} color={colors.textOnPrimary} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={openVoiceCapture}
                      style={({ pressed }) => [
                        styles.miniFab,
                        pressed && styles.miniFabPressed,
                      ]}
                    >
                      <Mic size={16} color={colors.textOnPrimary} />
                    </Pressable>
                  </View>
                </View>
              ) : null}
              <TransactionList
                items={overview?.recent_transactions ?? []}
                variant="card"
              />
            </>
          )}
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
    fontSize: 16,
    lineHeight: 22,
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
  categoryIconSkeleton: {
    width: 42,
    height: 42,
    borderRadius: 14,
  },
  categoryTitleSkeleton: {
    marginTop: spacing.xs,
    height: 14,
    width: "86%",
    borderRadius: 6,
  },
  categoryAmountSkeleton: {
    marginTop: spacing.sm,
    height: 14,
    width: "64%",
    borderRadius: 6,
  },
  categoryProgressSkeleton: {
    marginTop: spacing.md,
    height: 7,
    width: "100%",
    borderRadius: 999,
  },
  topCategoryEmptyState: {
    paddingVertical: spacing.md,
  },
  miniFabRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  miniFab: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.headerGradientStart,
  },
  miniFabPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.92,
  },
  recentCard: {
    padding: spacing.xl,
    borderRadius: 20,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllButtonPressed: {
    opacity: 0.7,
  },
  viewAllText: {
    fontFamily: typography.screenTitle.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    color: colors.primary,
  },
  emptyCard: {
    padding: spacing.xl,
    borderRadius: 20,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: spacing.lg,
    alignItems: "center",
  },
  emptyCardInlineWrap: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  emptyCardText: {
    fontFamily: typography.screenSubtitle.fontFamily,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
});
