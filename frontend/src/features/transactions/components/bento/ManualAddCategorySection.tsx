import { ChevronDown, ChevronUp, Repeat } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { AddCategoryTrigger } from "@/components/categories/AddCategoryTrigger";
import { CategoryPill } from "@/components/categories/CategoryPill";
import { fontFamilies, radius, spacing } from "@/constants";
import type { CategoryRow } from "@/features/categories/types";
import { createThemedStyles, useTheme } from "@/theme";

type ManualAddCategorySectionProps = {
  categoriesLoading: boolean;
  visibleCategories: CategoryRow[];
  categoryId: string | null;
  onCategoryPress: (category: CategoryRow, selected: boolean) => void;
  /** Omit to hide the "add category" trigger (forms that cannot detour to create one). */
  onAddCategory?: () => void;
  addCategoryDisabled?: boolean;
  /**
   * Recurring categories that fit the transaction type (rent, subscriptions / salary, ...): a second,
   * collapsible "Recurring" group below the main pills. Omit or pass none to hide it.
   */
  recurringCategories?: CategoryRow[];
};

export function ManualAddCategorySection({
  categoriesLoading,
  visibleCategories,
  categoryId,
  onCategoryPress,
  onAddCategory,
  addCategoryDisabled = false,
  recurringCategories,
}: ManualAddCategorySectionProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  // null = follow the selection: the group opens by itself while one of its categories is picked.
  const [recurringToggle, setRecurringToggle] = useState<boolean | null>(null);
  const recurringOptions = recurringCategories ?? [];
  const recurringSelected = recurringOptions.some((category) => category.id === categoryId);
  const recurringOpen = recurringToggle ?? recurringSelected;
  return (
    <View>
      {categoriesLoading ? (
        <View style={styles.categoriesLoading}>
          <ActivityIndicator color={colors.accentText} />
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
          {onAddCategory ? (
            <AddCategoryTrigger
              disabled={addCategoryDisabled}
              onPress={onAddCategory}
            />
          ) : null}
        </View>
      )}
      {!categoriesLoading && recurringOptions.length > 0 ? (
        <View style={styles.recurringGroup}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: recurringOpen }}
            onPress={() => setRecurringToggle(!recurringOpen)}
            style={({ pressed }) => [
              styles.recurringHeader,
              pressed && styles.recurringHeaderPressed,
            ]}
          >
            <Repeat size={14} color={colors.inkSoft} strokeWidth={2} />
            <Text style={styles.recurringTitle}>Recurring</Text>
            <Text style={styles.recurringHint} numberOfLines={1}>
              Rent, salary and other recurring money
            </Text>
            {recurringOpen ? (
              <ChevronUp size={16} color={colors.inkSoft} strokeWidth={2} />
            ) : (
              <ChevronDown size={16} color={colors.inkSoft} strokeWidth={2} />
            )}
          </Pressable>
          {recurringOpen ? (
            <View style={styles.categoryGrid}>
              {recurringOptions.map((category) => {
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
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  categoriesLoading: {
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
  recurringGroup: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  recurringHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  recurringHeaderPressed: {
    opacity: 0.7,
  },
  recurringTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  recurringHint: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkFaint,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
}));
