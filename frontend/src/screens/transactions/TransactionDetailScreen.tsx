import type { RouteProp } from "@react-navigation/native";
import { useRoute } from "@react-navigation/native";
import { StyleSheet, View } from "react-native";

import {
  TRANSACTION_DETAIL_SECTION_GAP,
  TransactionDetailHeroTile,
  TransactionDetailMetaCard,
} from "@/features/transactions/components/bento";
import type { MainStackParamList } from "@/navigation/types";

type TransactionDetailRoute = RouteProp<
  MainStackParamList,
  "TransactionDetail"
>;

export default function TransactionDetailScreen() {
  const { params } = useRoute<TransactionDetailRoute>();
  const { transaction } = params;

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
