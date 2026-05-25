import { Plus } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, spacing } from "@/constants/theme";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";

type AddCategoryTriggerProps = {
  onPress: () => void;
  disabled?: boolean;
};

export function AddCategoryTrigger({
  onPress,
  disabled = false,
}: AddCategoryTriggerProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add custom category"
      disabled={disabled}
      onPress={() => {
        void triggerLightHaptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.addPill,
        disabled && styles.addPillDisabled,
        pressed && !disabled && styles.addPillPressed,
      ]}
    >
      {disabled ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : (
        <Plus size={16} color={colors.primary} strokeWidth={2} />
      )}
      <Text style={styles.addPillLabel}>Custom</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  addPill: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.primary,
    backgroundColor: colors.pageBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addPillDisabled: {
    opacity: 0.5,
    borderColor: colors.border,
  },
  addPillPressed: {
    opacity: 0.9,
  },
  addPillLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    color: colors.primary,
  },
});
