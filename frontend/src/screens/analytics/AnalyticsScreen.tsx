import { StyleSheet, Text, View } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { colors, radius, spacing, typography } from "@/constants/theme";

export default function AnalyticsScreen() {
  return (
    <TabScreenShell>
      <View style={styles.body}>
        <Text style={styles.title}>Insights</Text>
        <Text style={styles.subtitle}>
          Placeholder - charts and spending breakdown will load here.
        </Text>
        <View style={styles.emptyHint}>
          <Text style={styles.emptyText}>No insights data yet</Text>
        </View>
      </View>
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  title: typography.screenTitle,
  subtitle: {
    ...typography.screenSubtitle,
    marginTop: spacing.sm,
  },
  emptyHint: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.barBackground,
    alignItems: "center",
  },
  emptyText: typography.emptyHint,
});
