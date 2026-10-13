import { Plus } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text } from "react-native";

import { ScreenSectionHeader } from "@/components/shared";
import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";

type BudgetCategoriesSectionHeaderProps = {
  onAddPress: () => void;
  addDisabled: boolean;
};

export const BudgetCategoriesSectionHeader = memo(
  function BudgetCategoriesSectionHeader({
    onAddPress,
    addDisabled,
  }: BudgetCategoriesSectionHeaderProps) {
    const { colors } = useTheme();
    const styles = useStyles();
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
            <Plus size={14} color={colors.accentText} strokeWidth={2.5} />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        }
      />
    );
  },
);

const useStyles = createThemedStyles(({ colors }) => ({
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.accentTint,
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
    color: colors.accentText,
  },
}));
