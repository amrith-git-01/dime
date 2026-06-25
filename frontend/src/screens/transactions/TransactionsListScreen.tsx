import { memo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { EmptyState, emptyStateCopy } from "@/components/shared";
import {
  accent,
  danger,
  inkSoft,
  line,
  paper,
  radius,
  shadows,
  spacing,
  success,
  surface,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { TransactionRow } from "@/features/transactions/components";
import type { TransactionRow as TransactionRowType } from "@/features/transactions/types";
import type { TransactionListSection } from "@/features/transactions/utils/buildTransactionFlashListData";
import { formatTransactionListAmount } from "@/features/transactions/utils/transactionDisplay";

import { useTransactionsListScreenModel } from "./useTransactionsListScreenModel";

type SectionCardProps = {
  section: TransactionListSection;
  netTotal: number;
  onTransactionPress: (transaction: TransactionRowType) => void;
};

const SectionCard = memo(function SectionCard({
  section,
  netTotal,
  onTransactionPress,
}: SectionCardProps) {
  const netColor = netTotal < 0 ? danger : netTotal > 0 ? success : inkSoft;
  const formatted = formatTransactionListAmount(netTotal);

  return (
    <View style={styles.sectionGroup}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={[styles.sectionTotal, { color: netColor }]}>
          {formatted}
        </Text>
      </View>

      <View style={styles.card}>
        {section.data.map((transaction, index) => (
          <View key={transaction.id}>
            <TransactionRow
              transaction={transaction}
              onPress={onTransactionPress}
            />
            {index < section.data.length - 1 && (
              <View style={styles.rowDivider} />
            )}
          </View>
        ))}
      </View>
    </View>
  );
});

function resolveListEmptyCopy(
  filter: "day" | "category" | "payee",
  usesRange: boolean,
) {
  if (filter === "day") {
    return emptyStateCopy.transactionsListDay;
  }
  if (filter === "category") {
    return usesRange
      ? emptyStateCopy.transactionsListCategoryRange
      : emptyStateCopy.transactionsListCategory;
  }
  return usesRange
    ? emptyStateCopy.transactionsListPayeeRange
    : emptyStateCopy.transactionsListPayee;
}

export default function TransactionsListScreen() {
  const {
    listSections,
    sectionNetTotals,
    filter,
    usesRange,
    isEmpty,
    isError,
    openTransactionDetail,
    showInitialLoading,
    showLoadingMore,
    transactionCount,
    monthLabel,
  } = useTransactionsListScreenModel();

  if (showInitialLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={accent} size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <EmptyState
        layout="centered"
        headline={emptyStateCopy.transactionsListError.headline}
        subtext={emptyStateCopy.transactionsListError.subtext}
      />
    );
  }

  if (isEmpty) {
    const copy = resolveListEmptyCopy(filter, usesRange);
    return (
      <EmptyState
        layout="centered"
        headline={copy.headline}
        subtext={copy.subtext}
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.subtitleRow}>
        <Text style={styles.subtitle}>
          {`${transactionCount} transaction${transactionCount !== 1 ? "s" : ""} · ${monthLabel}`}
        </Text>
      </View>

      {listSections.map((section) => (
        <SectionCard
          key={section.key}
          section={section}
          netTotal={sectionNetTotals[section.key] ?? 0}
          onTransactionPress={openTransactionDetail}
        />
      ))}

      {showLoadingMore ? (
        <View style={styles.loadingMore}>
          <ActivityIndicator color={accent} />
        </View>
      ) : null}

      <View style={styles.footer} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: paper,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.xl,
  },
  subtitleRow: {
    paddingBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: inkSoft,
  },
  sectionGroup: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
  },
  sectionTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sectionTotal: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ["tabular-nums"],
  },
  card: {
    backgroundColor: surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadows.card,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: line,
    marginLeft: spacing.lg + 40 + spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingMore: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  footer: {
    height: spacing.xl * 2,
  },
});
