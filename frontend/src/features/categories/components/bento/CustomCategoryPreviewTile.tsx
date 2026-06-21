import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import { ink, inkSoft, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
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
    const displayName = name.trim().length > 0 ? name.trim() : "Category Name";
    const tileBg = useMemo(() => `${color}14`, [color]);

    return (
      <View style={styles.wrap}>
        <View style={[styles.iconTile, { backgroundColor: tileBg }]}>
          <CategoryLucideIcon
            iconName={iconName}
            color={color}
            size={22}
            strokeWidth={1.5}
          />
        </View>
        <View style={styles.meta}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.hint}>
            This is how it&apos;ll appear in your budget list
          </Text>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconTile: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  meta: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: ink,
  },
  hint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkSoft,
  },
});
