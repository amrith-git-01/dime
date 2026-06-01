import { StyleSheet, View } from "react-native";

import {
  TRANSACTION_DETAIL_SECTION_GAP,
  TransactionDetailHeroTile,
  TransactionDetailMetaCard,
} from "./bento";
import type { TransactionRow } from "@/features/transactions/types";

export type TransactionDetailBodyProps = {
  transaction: TransactionRow;
};

export function TransactionDetailBody({
  transaction,
}: TransactionDetailBodyProps) {
  return (
    <View style={styles.root}>
      <TransactionDetailHeroTile transaction={transaction} />
      <TransactionDetailMetaCard transaction={transaction} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: TRANSACTION_DETAIL_SECTION_GAP,
  },
});
