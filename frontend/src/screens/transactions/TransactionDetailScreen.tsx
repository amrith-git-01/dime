import type { RouteProp } from "@react-navigation/native";
import { useRoute } from "@react-navigation/native";
import { StyleSheet, View } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { spacing } from "@/constants/theme";
import { TransactionDetailBody } from "@/features/transactions/components/TransactionDetailBody";
import type { MainStackParamList } from "@/navigation/types";

type TransactionDetailRoute = RouteProp<
  MainStackParamList,
  "TransactionDetail"
>;

export default function TransactionDetailScreen() {
  const { params } = useRoute<TransactionDetailRoute>();
  const { transaction } = params;

  return (
    <TabScreenShell>
      <View style={styles.inner}>
        <TransactionDetailBody transaction={transaction} />
      </View>
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  inner: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
});
