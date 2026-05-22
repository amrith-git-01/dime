import { ArrowLeftRight } from "lucide-react-native";
import { memo } from "react";
import { StyleSheet, View } from "react-native";

import type { TransactionRow } from "@/features/transactions/types";

import { BENTO_GAP } from "@/components/bento/bentoLayoutTokens";
import {
  BentoQuickAddPills,
  BentoSectionCard,
  BentoTransactionTile,
  TwoToneEmptyState,
} from "@/components/shared";

import { BentoSectionHeader } from "./BentoSectionHeader";

import { HOME_MAX_RECENT } from "./homeBentoTokens";

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
          <TwoToneEmptyState
            layout="inline"
            icon={ArrowLeftRight}
            title="No recent transactions"
            message="Transactions will appear here as you add them."
            footer={
              <BentoQuickAddPills
                onManualAdd={onManualAdd}
                onReceipt={onReceipt}
                onVoice={onVoice}
              />
            }
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
    gap: BENTO_GAP,
  },
});
