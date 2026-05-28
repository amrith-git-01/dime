import { memo, useCallback } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { AnimatedProgressBar } from "@/components/ui/AnimatedProgressBar";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { colors, layout, radius, spacing, typography } from "@/constants/theme";
import { CategoryLucideIcon } from "@/features/categories/components/CategoryLucideIcon";

export type HomeCategoryUiItem = {
  id: string;
  label: string;
  icon_name: string;
  amount: string;
  progress: number;
  color: string;
  muted: string;
};

const SKELETON_KEYS = ["0", "1", "2", "3", "4"] as const;

type HomeCategoryRailProps = {
  isPending: boolean;
  items: HomeCategoryUiItem[];
  showCategoryProgress: boolean;
};

function CategorySkeletonCard() {
  return (
    <View style={styles.categoryCard}>
      <View style={styles.categoryCardBody}>
        <View style={styles.categoryHeader}>
          <SkeletonBlock tone="surface" style={styles.categoryIconSkeleton} />
        </View>
        <SkeletonBlock tone="surface" style={styles.categoryTitleSkeleton} />
        <SkeletonBlock tone="surface" style={styles.categoryAmountSkeleton} />
      </View>
      <SkeletonBlock tone="surface" style={styles.categoryProgressSkeleton} />
    </View>
  );
}

const CategoryCard = memo(function CategoryCard({
  item,
  showCategoryProgress,
}: {
  item: HomeCategoryUiItem;
  showCategoryProgress: boolean;
}) {
  return (
    <View style={styles.categoryCard}>
      <View style={styles.categoryCardBody}>
        <View style={styles.categoryHeader}>
          <View
            style={[styles.categoryIconTile, { backgroundColor: item.muted }]}
          >
            <CategoryLucideIcon
              iconName={item.icon_name}
              color={item.color}
              size={20}
              strokeWidth={1.5}
            />
          </View>
        </View>
        <Text style={styles.categoryName} numberOfLines={2}>
          {item.label}
        </Text>
        <Text style={styles.categoryAmount}>{item.amount}</Text>
      </View>
      {showCategoryProgress ? (
        <View style={styles.categoryProgressWrap}>
          <AnimatedProgressBar
            progress={item.progress}
            fillColor={item.color}
            backgroundColor={item.muted}
            height={7}
            duration={800}
            animateOnceKey={`home-cat-${item.id}`}
          />
        </View>
      ) : null}
    </View>
  );
});

export const HomeCategoryRail = memo(function HomeCategoryRail({
  isPending,
  items,
  showCategoryProgress,
}: HomeCategoryRailProps) {
  const renderCategory = useCallback(
    ({ item }: { item: HomeCategoryUiItem }) => (
      <CategoryCard item={item} showCategoryProgress={showCategoryProgress} />
    ),
    [showCategoryProgress],
  );

  const renderSkeleton = useCallback(() => <CategorySkeletonCard />, []);

  if (isPending) {
    return (
      <FlatList
        horizontal
        data={SKELETON_KEYS}
        keyExtractor={(key) => `category-skeleton-${key}`}
        renderItem={renderSkeleton}
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        removeClippedSubviews
        contentContainerStyle={styles.categoryRail}
      />
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={renderCategory}
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      removeClippedSubviews
      contentContainerStyle={styles.categoryRail}
    />
  );
});

const styles = StyleSheet.create({
  categoryRail: {
    gap: spacing.md,
    paddingRight: spacing.lg,
    paddingBottom: spacing.xl,
  },
  categoryCard: {
    width: 152,
    minHeight: 186,
    ...layout.card,
    padding: spacing.lg,
    justifyContent: "space-between",
  },
  categoryCardBody: {
    flexGrow: 1,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  categoryIconTile: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryName: {
    fontFamily: typography.headerUsernameLine.fontFamily,
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    minHeight: 40,
  },
  categoryAmount: {
    marginTop: spacing.xs,
    fontFamily: typography.monoEmphasis.fontFamily,
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    minHeight: 20,
  },
  categoryProgressWrap: {
    marginTop: spacing.md,
    width: "100%",
  },
  categoryIconSkeleton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
  },
  categoryTitleSkeleton: {
    marginTop: spacing.xs,
    height: 14,
    width: "86%",
    borderRadius: radius.xs,
  },
  categoryAmountSkeleton: {
    marginTop: spacing.sm,
    height: 14,
    width: "64%",
    borderRadius: radius.xs,
  },
  categoryProgressSkeleton: {
    marginTop: spacing.md,
    height: 7,
    width: "100%",
    borderRadius: radius.full,
  },
});
