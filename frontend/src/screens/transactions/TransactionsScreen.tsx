import { format } from "date-fns";
import { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { fontFamilies } from "@/constants/fonts";
import { colors, spacing, typography } from "@/constants/theme";
import { formatInrAmount } from "@/features/transactions/formatAmount";
import { useTransactionsQuery } from "@/features/transactions/hooks/useTransactionsQuery";
import type { TransactionRow } from "@/features/transactions/types";

const CATEGORY_EMOJI: Record<string, string> = {
  food: "🍔",
  groceries: "🛒",
  transport: "🚗",
  shopping: "🛍️",
  bills: "📄",
  entertainment: "🎬",
  health: "⚕️",
  income: "💰",
};

function categoryEmoji(category: string | null): string {
  if (!category) {
    return "💳";
  }
  const key = category.trim().toLowerCase();
  return CATEGORY_EMOJI[key] ?? "💳";
}

export default function TransactionsScreen() {
  const { data, isPending, isError, error, refetch, isRefetching } =
    useTransactionsQuery();

  const renderItem = useCallback(({ item }: { item: TransactionRow }) => {
    const when = format(new Date(item.transaction_at), "h:mm a");
    const dateLine = format(new Date(item.transaction_at), "MMM d");
    const meta = `${dateLine} · ${item.detected_via ?? "manual"}`;
    const signed = formatInrAmount(item.amount, {
      signed: true,
      type: item.type,
    });

    return (
      <View style={styles.row}>
        <View style={styles.iconTile}>
          <Text style={styles.iconEmoji}>{categoryEmoji(item.category)}</Text>
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.merchant} numberOfLines={1}>
            {item.merchant}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <Text
          style={[
            styles.amount,
            item.type === "credit" ? styles.amountCredit : styles.amountDebit,
          ]}
          numberOfLines={1}
        >
          {signed}
        </Text>
      </View>
    );
  }, []);

  const listEmpty = !isPending && !isError && (data?.length ?? 0) === 0;

  return (
    <TabScreenShell>
      <View style={styles.body}>
        <Text style={styles.title}>Transactions</Text>
        <Text style={styles.subtitle}>
          Recent activity from your linked accounts and manual entries.
        </Text>

        {isPending ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.headerGradientStart} />
          </View>
        ) : null}

        {isError ? (
          <View style={styles.centered}>
            <Text style={styles.errorTitle}>Could not load transactions</Text>
            <Text style={styles.errorBody}>
              {error instanceof Error ? error.message : "Something went wrong."}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void refetch();
              }}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.retryPressed,
              ]}
            >
              <Text style={styles.retryLabel}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {listEmpty ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptyBody}>
              Tap the + button on the tab bar and choose Manual to add your
              first one.
            </Text>
          </View>
        ) : null}

        {!isPending && !isError && !listEmpty ? (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => (
              <View style={{ height: spacing.sm }} />
            )}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={() => {
                  void refetch();
                }}
                tintColor={colors.headerGradientStart}
              />
            }
          />
        ) : null}
      </View>
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.screenSubtitle,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.barBackground,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    minHeight: 68,
    shadowColor: colors.headerGradientStart,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(15, 23, 42, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  iconEmoji: {
    fontSize: 18,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.sm,
  },
  merchant: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  meta: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  amount: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "right",
    flexShrink: 0,
  },
  amountDebit: {
    color: colors.textPrimary,
  },
  amountCredit: {
    color: colors.success,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
  },
  errorTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary,
    textAlign: "center",
  },
  errorBody: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  retryButton: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.textPrimary,
  },
  retryPressed: {
    opacity: 0.9,
  },
  retryLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    color: colors.barBackground,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  emptyTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary,
    textAlign: "center",
  },
  emptyBody: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
