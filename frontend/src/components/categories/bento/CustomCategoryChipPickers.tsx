import { memo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, radius, spacing, surfaces } from "@/constants";
import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import {
  CUSTOM_CATEGORY_COLOR_OPTIONS,
  CUSTOM_CATEGORY_ICON_OPTIONS,
  type CustomCategoryIconName,
} from "@/features/categories/constants/customCategoryPresets";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";

type CustomCategoryChipPickersProps = {
  selectedIcon: CustomCategoryIconName;
  selectedColor: string;
  onSelectIcon: (icon: CustomCategoryIconName) => void;
  onSelectColor: (color: string) => void;
};

export const CustomCategoryChipPickers = memo(
  function CustomCategoryChipPickers({
    selectedIcon,
    selectedColor,
    onSelectIcon,
    onSelectColor,
  }: CustomCategoryChipPickersProps) {
    return (
      <View style={styles.wrap}>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Icon</Text>
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
                    void triggerLightHaptic();
                    onSelectIcon(option);
                  }}
                  style={[
                    styles.iconChip,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                    },
                    selected && styles.iconChipSelected,
                  ]}
                >
                  <CategoryLucideIcon
                    iconName={option}
                    color={selected ? colors.primary : colors.textSecondary}
                    size={20}
                    strokeWidth={1.5}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Color</Text>
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
                    void triggerLightHaptic();
                    onSelectColor(option);
                  }}
                  style={[
                    styles.colorChip,
                    { backgroundColor: option },
                    {
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                />
              );
            })}
          </ScrollView>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
    backgroundColor: colors.barBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  iconChipSelected: {
    backgroundColor: surfaces.primaryTint08,
  },
  colorChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
  },
});
