import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BENTO_GAP } from "@/components/bento";
import type { BentoSectionEmptyQuickAddProps } from "@/components/shared";
import {
  BentoRecentTransactionsEmptyInset,
  BentoTransactionTile,
  TwoToneCard,
} from "@/components/shared";
import { bento, colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { TransactionRow } from "@/features/transactions/types";

import { TOP_EXPENSES_MAX } from "../constants/topExpenses";
import { InsightsTopExpensesSkeleton } from "./InsightsAnalyticsSkeletons";

export type InsightsTopExpensesCardProps = BentoSectionEmptyQuickAddProps & {
  topExpenses: TransactionRow[];
  loading?: boolean;
  onTransactionPress: (transaction: TransactionRow) => void;
};

export const InsightsTopExpensesCard = memo(function InsightsTopExpensesCard({
  topExpenses,
  loading = false,
  onTransactionPress,
  onManualAdd,
  onReceipt,
  onVoice,
}: InsightsTopExpensesCardProps) {
  const visible = useMemo(
    () => topExpenses.slice(0, TOP_EXPENSES_MAX),
    [topExpenses],
  );
  const isEmpty = !loading && visible.length === 0;

  return (
    <TwoToneCard
      header={
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Top expenses</Text>
          <Text style={styles.headerSubtitle}>Largest debits this month</Text>
        </View>
      }
      body={
        <View style={styles.body}>
          {loading ? (
            <InsightsTopExpensesSkeleton />
          ) : isEmpty ? (
            <BentoRecentTransactionsEmptyInset
              onManualAdd={onManualAdd}
              onReceipt={onReceipt}
              onVoice={onVoice}
            />
          ) : (
            <View style={styles.stack}>
              {visible.map((transaction) => (
                <BentoTransactionTile
                  key={transaction.id}
                  transaction={transaction}
                  onPress={onTransactionPress}
                />
              ))}
            </View>
          )}
        </View>
      }
    />
  );
});

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.primary,
  },
  headerSubtitle: {
    marginTop: 2,
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: bento.onPastel.muted,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  stack: {
    gap: BENTO_GAP,
  },
});
