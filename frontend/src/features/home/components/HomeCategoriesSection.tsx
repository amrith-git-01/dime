import { memo } from "react";
import { StyleSheet, View } from "react-native";

import type { CategorySpendRowData } from "@/components/categories/CategorySpendBentoRow";
import { CategorySpendBentoRow } from "@/components/categories/CategorySpendBentoRow";
import { EmptyState, emptyStateCopy } from "@/components/shared";
import { SkeletonBlock } from "@/components/ui";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { tourTargetIds } from "@/constants/tourTargetIds";
import { useTourTarget } from "@/hooks/useTourTarget";

import { HomeSectionHeader } from "./HomeSectionHeader";
import { createThemedStyles } from "@/theme";

const SKELETON_COUNT = 4;

type HomeCategoriesSectionProps = {
  items: CategorySpendRowData[];
  hasMonthlyBudget: boolean;
  monthlyBudgetAmount: number;
  isLoading?: boolean;
  onViewAll: () => void;
  onCategoryPress: (item: CategorySpendRowData) => void;
};

export const HomeCategoriesSection = memo(function HomeCategoriesSection({
  items,
  hasMonthlyBudget,
  monthlyBudgetAmount,
  isLoading = false,
  onViewAll,
  onCategoryPress,
}: HomeCategoriesSectionProps) {
  const styles = useStyles();
  const tourTarget = useTourTarget(tourTargetIds.homeCategories);
  return (
    <View {...tourTarget}>
      <HomeSectionHeader title="Top categories" onViewAll={onViewAll} />

      <View style={styles.card}>
        {isLoading ? (
          Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <View key={i}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.skeletonRow}>
                <SkeletonBlock style={styles.skeletonTile} />
                <View style={styles.skeletonMeta}>
                  <SkeletonBlock style={styles.skeletonPrimary} />
                  <SkeletonBlock style={styles.skeletonSecondary} />
                </View>
                <SkeletonBlock style={styles.skeletonAmount} />
              </View>
            </View>
          ))
        ) : items.length === 0 ? (
          <EmptyState
            layout="inset"
            headline={emptyStateCopy.homeCategories.headline}
            subtext={emptyStateCopy.homeCategories.subtext}
          />
        ) : (
          items.map((item, index) => (
            <View key={item.id}>
              {index > 0 && <View style={styles.divider} />}
              <View style={styles.rowPad}>
                <CategorySpendBentoRow
                  item={item}
                  hasMonthlyBudget={hasMonthlyBudget}
                  monthlyBudgetAmount={monthlyBudgetAmount}
                  onPress={() => onCategoryPress(item)}
                />
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadows.card,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginHorizontal: spacing.lg,
  },
  rowPad: {
    // Horizontal indent only — CategorySpendBentoRow owns its own paddingVertical.
    paddingHorizontal: spacing.lg,
  },
  // Skeleton
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  skeletonTile: {
    width: 46,
    height: 46,
    borderRadius: radius.sm,
  },
  skeletonMeta: {
    flex: 1,
    gap: 6,
  },
  skeletonPrimary: {
    height: 14,
    width: "60%",
    borderRadius: 4,
  },
  skeletonSecondary: {
    height: 11,
    width: "40%",
    borderRadius: 4,
  },
  skeletonAmount: {
    height: 14,
    width: 48,
    borderRadius: 4,
  },
}));
