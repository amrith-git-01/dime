import { memo } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import { radius, spacing } from "@/constants";
import {
  CUSTOM_CATEGORY_COLOR_OPTIONS,
  CUSTOM_CATEGORY_ICON_OPTIONS,
  type CustomCategoryIconName,
} from "@/features/categories/constants/customCategoryPresets";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";

type CustomCategoryChipPickersProps = {
  selectedIcon: CustomCategoryIconName;
  selectedColor: string;
  onSelectIcon: (icon: CustomCategoryIconName) => void;
  onSelectColor: (color: string) => void;
  /** Which picker row(s) to render — defaults to both. */
  section?: "icon" | "color" | "both";
};

export const CustomCategoryChipPickers = memo(
  function CustomCategoryChipPickers({
    selectedIcon,
    selectedColor,
    onSelectIcon,
    onSelectColor,
    section = "both",
  }: CustomCategoryChipPickersProps) {
    const { colors } = useTheme();
    const styles = useStyles();
    const showIcon = section === "icon" || section === "both";
    const showColor = section === "color" || section === "both";

    return (
      <View style={styles.wrap}>
        {showIcon ? (
          <View style={styles.section}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {CUSTOM_CATEGORY_ICON_OPTIONS.map((option) => {
                const selected = option === selectedIcon;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option}
                    onPress={() => {
                      void triggerHaptic();
                      onSelectIcon(option);
                    }}
                    style={[
                      styles.iconChip,
                      selected && styles.iconChipSelected,
                    ]}
                  >
                    <CategoryLucideIcon
                      iconName={option}
                      color={selected ? colors.accentText : colors.inkFaint}
                      size={20}
                      strokeWidth={1.5}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {showColor ? (
          <View style={styles.section}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {CUSTOM_CATEGORY_COLOR_OPTIONS.map((option) => {
                const selected = option === selectedColor;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Color ${option}`}
                    onPress={() => {
                      void triggerHaptic();
                      onSelectColor(option);
                    }}
                    style={[
                      styles.colorChipOuter,
                      selected && styles.colorChipOuterSelected,
                    ]}
                  >
                    <View
                      style={[styles.colorChip, { backgroundColor: option }]}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>
    );
  },
);

const useStyles = createThemedStyles(({ colors }) => ({
  wrap: {
    gap: spacing.lg,
  },
  section: {
    gap: spacing.xs,
  },
  chipRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: "center",
  },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  iconChipSelected: {
    backgroundColor: colors.accentTint,
    borderColor: colors.accent,
  },
  colorChipOuter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorChipOuterSelected: {
    borderColor: colors.accent,
    padding: 3,
  },
  colorChip: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
  },
}));
