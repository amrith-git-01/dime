import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { EmptyState, emptyStateCopy } from "@/components/shared";
import { spacing } from "@/constants";
import { TransactionRow } from "@/features/transactions/components/TransactionRow";
import type { TransactionRow as TransactionRowData } from "@/features/transactions/types";

import { TOP_EXPENSES_MAX } from "../constants/topExpenses";
import { InsightsTopExpensesSkeleton } from "./InsightsAnalyticsSkeletons";
import { InsightsCard } from "./InsightsCard";
import { createThemedStyles } from "@/theme";

export type InsightsTopExpensesCardProps = {
  topExpenses: TransactionRowData[];
  loading?: boolean;
  onTransactionPress: (transaction: TransactionRowData) => void;
  onManualAdd?: () => void;
};

export const InsightsTopExpensesCard = memo(function InsightsTopExpensesCard({
  topExpenses,
  loading = false,
  onTransactionPress,
  onManualAdd,
}: InsightsTopExpensesCardProps) {
  const styles = useStyles();
  const visible = useMemo(
    () => topExpenses.slice(0, TOP_EXPENSES_MAX),
    [topExpenses],
  );
  const isEmpty = !loading && visible.length === 0;

  return (
    <InsightsCard
      kicker="TOP EXPENSES"
      subtitle="Largest debits this month · Excludes fixed costs"
    >
      {loading ? (
        <InsightsTopExpensesSkeleton />
      ) : isEmpty ? (
        <View style={styles.body}>
          <EmptyState
            layout="inset"
            headline={emptyStateCopy.analyticsTopExpenses.headline}
            subtext={emptyStateCopy.analyticsTopExpenses.subtext}
            actionLabel={
              onManualAdd
                ? emptyStateCopy.analyticsTopExpenses.actionLabel
                : undefined
            }
            onAction={onManualAdd}
          />
        </View>
      ) : (
        <View>
          {visible.map((transaction, index) => (
            <View key={transaction.id}>
              {index > 0 && <View style={styles.rowDivider} />}
              <TransactionRow
                transaction={transaction}
                onPress={onTransactionPress}
              />
            </View>
          ))}
        </View>
      )}
    </InsightsCard>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  body: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginLeft: spacing.lg + 40 + spacing.md,
  },
}));
