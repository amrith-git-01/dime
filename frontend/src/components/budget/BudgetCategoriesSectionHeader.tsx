import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, spacing, typography } from "@/constants";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";

type BudgetCategoriesSectionHeaderProps = {
  onAddPress: () => void;
  addDisabled: boolean;
};

export const BudgetCategoriesSectionHeader = memo(
  function BudgetCategoriesSectionHeader({
    onAddPress,
    addDisabled,
  }: BudgetCategoriesSectionHeaderProps) {
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>All categories</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add custom category"
          accessibilityState={{ disabled: addDisabled }}
          disabled={addDisabled}
          onPress={() => {
            void triggerLightHaptic();
            onAddPress();
          }}
          style={({ pressed }) => [
            styles.addButton,
            addDisabled && styles.addButtonDisabled,
            pressed && !addDisabled && styles.addButtonPressed,
          ]}
        >
          <Text
            style={[
              styles.addButtonText,
              addDisabled && styles.addButtonTextDisabled,
            ]}
          >
            + Add
          </Text>
        </Pressable>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    flex: 1,
    marginRight: spacing.sm,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  addButtonDisabled: {
    opacity: 0.45,
  },
  addButtonPressed: {
    opacity: 0.75,
  },
  addButtonText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 18,
    color: colors.primary,
  },
  addButtonTextDisabled: {
    color: colors.textSecondary,
  },
});
