import { StyleSheet, Text, View } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { colors, spacing, typography } from "@/constants/theme";

export default function TransactionsScreen() {
  return (
    <TabScreenShell>
      <View style={styles.body}>
        <Text style={styles.title}>Transactions</Text>
        <Text style={styles.subtitle}>
          Placeholder - transaction list and filters will load here.
        </Text>
      </View>
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.screenSubtitle,
    marginTop: spacing.sm,
  },
});
