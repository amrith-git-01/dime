import { StyleSheet, Text, View } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { colors, spacing, typography } from "@/constants/theme";

export default function HomeScreen() {
  return (
    <TabScreenShell>
      <View style={styles.body}>
        <Text style={styles.title}>Home</Text>
        <Text style={styles.subtitle}>
          Placeholder — connect transactions and balances here.
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
