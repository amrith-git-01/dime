import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";

import { AddCategoryTrigger } from "@/components/categories/AddCategoryTrigger";
import { CategoryPill } from "@/components/categories/CategoryPill";
import { colors, radius, spacing } from "@/constants";
import { formStyles } from "@/constants/formStyles";
import type { LocalCategory } from "@/features/categories/hooks/useLocalCategories";

type ManualAddCategorySectionProps = {
  categoriesLoading: boolean;
  visibleCategories: LocalCategory[];
  categoryId: string | null;
  optionalTag: ReactNode;
  onCategoryPress: (category: LocalCategory, selected: boolean) => void;
  onAddCategory: () => void;
  addCategoryDisabled: boolean;
};

export function ManualAddCategorySection({
  categoriesLoading,
  visibleCategories,
  categoryId,
  optionalTag,
  onCategoryPress,
  onAddCategory,
  addCategoryDisabled,
}: ManualAddCategorySectionProps) {
  return (
    <View>
      <View style={styles.labelRow}>
        <Text style={formStyles.fieldLabel}>Category</Text>
        {optionalTag}
      </View>
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
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
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
