import { StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { fontFamilies } from "@/constants/fonts";
import { colors, spacing, typography } from "@/constants/theme";

export default function AnalyticsScreen() {
  return (
    <ScreenContainer>
      <View style={styles.body}>
        <Text style={styles.title}>Analytics</Text>
        <Text style={styles.subtitle}>
          Placeholder — charts and spending breakdown will load here.
        </Text>
        <View style={styles.emptyHint}>
          <Text style={styles.emptyText}>No analytics data yet</Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.screenSubtitle,
    marginTop: spacing.sm,
  },
  emptyHint: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.barBackground,
    alignItems: "center",
  },
  emptyText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    color: colors.inactive,
  },
});
