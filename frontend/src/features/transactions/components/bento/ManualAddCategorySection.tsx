import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AddCategoryTrigger } from "@/components/categories/AddCategoryTrigger";
import { CategoryPill } from "@/components/categories/CategoryPill";
import { colors, radius, spacing } from "@/constants";
import type { CategoryRow } from "@/features/categories/types";

type ManualAddCategorySectionProps = {
  categoriesLoading: boolean;
  visibleCategories: CategoryRow[];
  categoryId: string | null;
  onCategoryPress: (category: CategoryRow, selected: boolean) => void;
  onAddCategory: () => void;
  addCategoryDisabled: boolean;
};

export function ManualAddCategorySection({
  categoriesLoading,
  visibleCategories,
  categoryId,
  onCategoryPress,
  onAddCategory,
  addCategoryDisabled,
}: ManualAddCategorySectionProps) {
  return (
    <View>
      {categoriesLoading ? (
        <View style={styles.categoriesLoading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <View style={styles.categoryGrid}>
          {visibleCategories.map((category) => {
            const selected = categoryId === category.id;
            return (
              <CategoryPill
                key={category.id}
                label={category.name}
                iconName={category.icon_name}
                iconColor={category.color}
                selected={selected}
                onPress={() => onCategoryPress(category, selected)}
              />
            );
          })}
          <AddCategoryTrigger
            disabled={addCategoryDisabled}
            onPress={onAddCategory}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  categoriesLoading: {
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.pageBackground,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});
