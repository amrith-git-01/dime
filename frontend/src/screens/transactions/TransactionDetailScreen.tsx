import type { RouteProp } from "@react-navigation/native";
import { useRoute } from "@react-navigation/native";

import { TransactionDetailBody } from "@/features/transactions/components/TransactionDetailBody";
import type { MainStackParamList } from "@/navigation/types";

type TransactionDetailRoute = RouteProp<
  MainStackParamList,
  "TransactionDetail"
>;

export default function TransactionDetailScreen() {
  const { params } = useRoute<TransactionDetailRoute>();
  const { transaction } = params;

  return <TransactionDetailBody transaction={transaction} />;
}
