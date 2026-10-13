import { Plus } from "lucide-react-native";
import { ActivityIndicator, Pressable, Text } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { spacing } from "@/constants";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";

type AddCategoryTriggerProps = {
  onPress: () => void;
  disabled?: boolean;
};

export function AddCategoryTrigger({
  onPress,
  disabled = false,
}: AddCategoryTriggerProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add custom category"
      disabled={disabled}
      onPress={() => {
        void triggerHaptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.addPill,
        disabled && styles.addPillDisabled,
        pressed && !disabled && styles.addPillPressed,
      ]}
    >
      {disabled ? (
        <ActivityIndicator size="small" color={colors.inkSoft} />
      ) : (
        <Plus size={16} color={colors.accentText} strokeWidth={2} />
      )}
      <Text style={styles.addPillLabel}>Custom</Text>
    </Pressable>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  addPill: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.accent,
    backgroundColor: colors.paper,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addPillDisabled: {
    opacity: 0.5,
    borderColor: colors.line,
  },
  addPillPressed: {
    opacity: 0.9,
  },
  addPillLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    color: colors.accentText,
  },
}));
