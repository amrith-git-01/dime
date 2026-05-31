import { BarChart3 } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { TwoToneEmptyState } from "@/components/shared";
import { spacing, typography } from "@/constants";

export default function AnalyticsScreen() {
  return (
    <TabScreenShell>
      <View style={styles.body}>
        <Text style={styles.title}>Insights</Text>
        <Text style={styles.subtitle}>
          Placeholder - charts and spending breakdown will load here.
        </Text>
        <View style={styles.emptySlot}>
          <TwoToneEmptyState
            layout="inline"
            icon={BarChart3}
            title="No insights data yet"
            message="Charts and spending breakdown will appear here."
          />
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
  emptySlot: {
    marginTop: spacing.xl,
  },
});
