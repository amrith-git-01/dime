import { memo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import {
  accent,
  accentTint,
  inkFaint,
  inkSoft,
  line,
  radius,
  spacing,
  surface,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";
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
          <Text style={styles.fieldLabel}>Icon</Text>
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
                  style={[styles.iconChip, selected && styles.iconChipSelected]}
                >
                  <CategoryLucideIcon
                    iconName={option}
                    color={selected ? accent : inkFaint}
                    size={20}
                    strokeWidth={1.5}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.fieldLabel}>Color</Text>
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
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.lg,
  },
  section: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: inkSoft,
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
    borderColor: line,
    backgroundColor: surface,
    alignItems: "center",
    justifyContent: "center",
  },
  iconChipSelected: {
    backgroundColor: accentTint,
    borderColor: accent,
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
    borderColor: accent,
    padding: 3,
  },
  colorChip: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
  },
});
