import { Plus } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { ScreenSectionHeader } from "@/components/shared";
import { accent, accentTint, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

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
      <ScreenSectionHeader
        title="All categories"
        action={
          <Pressable
            onPress={() => {
              void triggerHaptic();
              onAddPress();
            }}
            disabled={addDisabled}
            style={({ pressed }) => [
              styles.addBtn,
              addDisabled && styles.addBtnDisabled,
              pressed && !addDisabled && styles.addBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Add custom category"
          >
            <Plus size={14} color={accent} strokeWidth={2.5} />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        }
      />
    );
  },
);

const styles = StyleSheet.create({
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: accentTint,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  addBtnDisabled: {
    opacity: 0.4,
  },
  addBtnPressed: {
    opacity: 0.7,
  },
  addBtnText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: accent,
  },
});
