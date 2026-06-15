import { Calendar, LayoutGrid, Receipt } from "lucide-react-native";
import { memo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { BENTO_GAP, BENTO_SECTION_HEADER_GAP } from "@/components/bento";
import { BentoTransactionTile, TwoToneEmptyState } from "@/components/shared";
import { bento, colors, spacing, typography } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { TransactionRow } from "@/features/transactions/types";
import type { TransactionListSection } from "@/features/transactions/utils/buildTransactionFlashListData";

import { useTransactionsListScreenModel } from "./useTransactionsListScreenModel";

const TransactionsListSection = memo(function TransactionsListSection({
  section,
  onTransactionPress,
}: {
  section: TransactionListSection;
  onTransactionPress: (transaction: TransactionRow) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <View style={styles.tileStack}>
        {section.data.map((transaction) => (
          <BentoTransactionTile
            key={transaction.id}
            transaction={transaction}
            onPress={onTransactionPress}
          />
        ))}
      </View>
    </View>
  );
});

export default function TransactionsListScreen() {
  const {
    listSections,
    filter,
    usesRange,
    isEmpty,
    isError,
    openTransactionDetail,
    showInitialLoading,
    showLoadingMore,
  } = useTransactionsListScreenModel();

  if (showInitialLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Loading transactions...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <TwoToneEmptyState
        layout="centered"
        icon={Receipt}
        title="Could not load transactions"
        message="Check your connection and try again."
      />
    );
  }

  if (isEmpty) {
    const emptyIcon =
      filter === "day"
        ? Calendar
        : filter === "category"
          ? LayoutGrid
          : Receipt;
    const emptyTitle =
      filter === "day"
        ? "No transactions on this day"
        : filter === "category"
          ? "No transactions in this category"
          : "No transactions for this payee";
    const emptyMessage =
      filter === "day"
        ? "Nothing was recorded for this date in the selected month."
        : filter === "category"
          ? usesRange
            ? "No debits were recorded in this category for the selected period."
            : "No debits were recorded in this category for the selected month."
          : usesRange
            ? "No debits matched this payee in the selected period."
            : "No debits matched this payee in the selected month.";

    return (
      <TwoToneEmptyState
        layout="centered"
        icon={emptyIcon}
        title={emptyTitle}
        message={emptyMessage}
      />
    );
  }

  return (
    <View style={styles.root}>
      {listSections.map((section) => (
        <TransactionsListSection
          key={section.key}
          section={section}
          onTransactionPress={openTransactionDetail}
        />
      ))}
      {showLoadingMore ? (
        <View style={styles.footer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    gap: spacing.lg,
  },
  section: {
    gap: BENTO_SECTION_HEADER_GAP,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: bento.onPastel.muted,
  },
  tileStack: {
    gap: BENTO_GAP,
  },
  centered: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  footer: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
});
