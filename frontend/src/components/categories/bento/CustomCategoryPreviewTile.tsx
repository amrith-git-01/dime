import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BudgetCategoryBentoRow } from "@/components/budget/bento/BudgetCategoryBentoRow";
import { fontFamilies } from "@/constants/fonts";
import { bento, colors, radius, spacing } from "@/constants/theme";
import type { CustomCategoryIconName } from "@/features/categories/constants/customCategoryPresets";

type CustomCategoryPreviewTileProps = {
  name: string;
  iconName: CustomCategoryIconName;
  color: string;
};

export const CustomCategoryPreviewTile = memo(
  function CustomCategoryPreviewTile({
    name,
    iconName,
    color,
  }: CustomCategoryPreviewTileProps) {
    const displayName = name.trim().length > 0 ? name.trim() : "Name";

    const previewItem = useMemo(
      () => ({
        id: "preview",
        name: displayName,
        icon_name: iconName,
        color,
        spentMonth: 0,
        is_system: false,
      }),
      [color, displayName, iconName],
    );

    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>Preview</Text>
        <View style={styles.rowShell}>
          <BudgetCategoryBentoRow
            item={previewItem}
            hasMonthlyBudget={false}
            monthlyBudgetAmount={0}
            nameWraps
          />
        </View>
        <Text style={styles.hint}>
          Icon uses your color; tile background is the list tint
        </Text>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rowShell: {
    backgroundColor: bento.sectionSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  hint: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
  },
});
