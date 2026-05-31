import { memo } from "react";
import { StyleSheet, View } from "react-native";

import type { TransactionRow } from "@/features/transactions/types";

import { BentoEmptyState } from "./BentoEmptyState";
import { BentoSectionCard } from "./BentoSectionCard";
import { BentoSectionHeader } from "./BentoSectionHeader";
import { BentoTransactionTile } from "./BentoTransactionTile";
import { HOME_BENTO_GAP, HOME_MAX_RECENT } from "./homeBentoTokens";

type HomeRecentSectionProps = {
  transactions: TransactionRow[];
  isEmpty: boolean;
  onViewAll: () => void;
  onTransactionPress: (tx: TransactionRow) => void;
  onManualAdd: () => void;
  onReceipt: () => void;
  onVoice: () => void;
};

/**
 * Recent transactions inside a soft pastel bento box.
 * Empty state: copy + compact quick-add pills.
 */
export const HomeRecentSection = memo(function HomeRecentSection({
  transactions,
  isEmpty,
  onViewAll,
  onTransactionPress,
  onManualAdd,
  onReceipt,
  onVoice,
}: HomeRecentSectionProps) {
  const visible = transactions.slice(0, HOME_MAX_RECENT);

  return (
    <View>
      <BentoSectionHeader title="Recent transactions" onViewAll={onViewAll} />

      <BentoSectionCard>
        {isEmpty ? (
          <BentoEmptyState
            title="No recent transactions"
            hint="Transactions will appear here as you add them."
            onManualAdd={onManualAdd}
            onReceipt={onReceipt}
            onVoice={onVoice}
          />
        ) : (
          <View style={styles.stack}>
            {visible.map((tx) => (
              <BentoTransactionTile
                key={tx.id}
                transaction={tx}
                onPress={onTransactionPress}
              />
            ))}
          </View>
        )}
      </BentoSectionCard>
    </View>
  );
});

const styles = StyleSheet.create({
  stack: {
    gap: HOME_BENTO_GAP,
  },
});
