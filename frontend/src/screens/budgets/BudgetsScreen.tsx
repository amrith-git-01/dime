import { StyleSheet, Text, View } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { colors, spacing, typography } from "@/constants/theme";

export default function BudgetsScreen() {
  return (
    <TabScreenShell>
      <View style={styles.body}>
        <Text style={styles.title}>Budgets</Text>
        <Text style={styles.subtitle}>
          Placeholder - budget goals and progress will load here.
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
