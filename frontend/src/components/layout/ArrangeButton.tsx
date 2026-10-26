import { ArrowUpDown } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { ARRANGE_ROW_HEIGHT } from "@/constants/layout";
import { spacing } from "@/constants/spacing";
import { createThemedStyles, useTheme } from "@/theme";

export type ArrangeButtonProps = {
  onPress: () => void;
  /** For screen readers; "Arrange Home" reads better than a bare "Arrange". */
  accessibilityLabel?: string;
};

/** The quiet "Arrange" text button at the end of Home, Budgets and Insights; it opens the Arrange sheet. */
export const ArrangeButton = memo(function ArrangeButton({
  onPress,
  accessibilityLabel = "Arrange",
}: ArrangeButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <ArrowUpDown color={colors.inkSoft} size={16} strokeWidth={1.75} />
        <Text style={styles.label}>Arrange</Text>
      </Pressable>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  wrap: {
    alignItems: "center",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: ARRANGE_ROW_HEIGHT,
    paddingHorizontal: spacing.lg,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
}));
