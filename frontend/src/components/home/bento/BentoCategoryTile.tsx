import { memo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { AnimatedProgressBar } from "@/components/ui/AnimatedProgressBar";
import { fontFamilies } from "@/constants/fonts";
import { bento, radius, spacing } from "@/constants/theme";
import { CategoryLucideIcon } from "@/features/categories/components/CategoryLucideIcon";

import { HOME_CATEGORY_TILE_MIN_HEIGHT } from "./homeBentoTokens";
import type { HomeCategoryBentoItem } from "./types";

type BentoCategoryTileProps = {
  item: HomeCategoryBentoItem;
  showProgress: boolean;
};

/**
 * Saturated 2-col category bento cell.
 * Background = category primary hex (full saturation per design-system §3.4).
 * All text uses bento.onSurface.* — never textPrimary on colored tile.
 */
export const BentoCategoryTile = memo(function BentoCategoryTile({
  item,
  showProgress,
}: BentoCategoryTileProps) {
  // shadowColor is per-category so it stays dynamic; Platform.OS check is negligible here.
  const shadowStyle = Platform.OS === "android"
    ? { elevation: 3 }
    : {
        shadowColor: item.color,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      };

  return (
    <View style={[styles.tile, { backgroundColor: item.color }, shadowStyle]}>
      {/* Icon chip — white translucent bg */}
      <View style={styles.iconChip}>
        <CategoryLucideIcon
          iconName={item.icon_name}
          color={bento.icon.fg}
          size={18}
          strokeWidth={1.5}
        />
      </View>

      {/* Category name */}
      <Text style={styles.label} numberOfLines={2}>
        {item.label}
      </Text>

      {/* Amount */}
      <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
        {item.amount}
      </Text>

      {/* Budget progress bar */}
      {showProgress ? (
        <View style={styles.progressWrap}>
          <AnimatedProgressBar
            progress={item.progress}
            fillColor={bento.chart.fill}
            backgroundColor={bento.chart.track}
            height={4}
            animateOnceKey={`bento-cat-${item.id}`}
          />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: HOME_CATEGORY_TILE_MIN_HEIGHT,
    justifyContent: "space-between",
  },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: bento.icon.bg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: bento.onSurface.secondary,
    flex: 1,
    marginBottom: spacing.xs,
  },
  amount: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 15,
    lineHeight: 20,
    color: bento.onSurface.primary,
  },
  progressWrap: {
    marginTop: spacing.sm,
  },
});
