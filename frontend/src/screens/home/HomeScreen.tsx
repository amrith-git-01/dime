import { StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { colors, spacing, typography } from "@/constants/theme";

export default function HomeScreen() {
  return (
    <ScreenContainer>
      <View style={styles.body}>
        <Text style={styles.title}>Home</Text>
        <Text style={styles.subtitle}>
          Placeholder — connect transactions and balances here.
        </Text>
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
});
