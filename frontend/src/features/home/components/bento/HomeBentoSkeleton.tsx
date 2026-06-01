import { StyleSheet, View } from "react-native";

import { SkeletonBlock } from "@/components/ui";
import { bento, colors, radius, spacing } from "@/constants";

import {
  BENTO_GAP,
  BENTO_SECTION_CARD_PADDING,
  BENTO_SECTION_GAP,
  BENTO_TRANSACTION_TILE_MIN_HEIGHT,
} from "@/components/bento";

import {
  HOME_CATEGORY_TILE_MIN_HEIGHT,
  HOME_INCOME_TILE_MIN_HEIGHT,
  HOME_SPEND_FLEX,
  HOME_SPEND_RING_SIZE,
  HOME_SPEND_ROW_MIN_HEIGHT,
} from "./homeBentoTokens";

/**
 * Shape-matched loading skeleton for the bento Home layout.
 * Mirrors exact geometry: spend row 45/55 split, income bar, 2×2 category grid, 3 recent tiles.
 * Colored tiles use onPrimary tone (white shimmer on hued bg).
 * White card tiles use surface tone.
 */
export function HomeBentoSkeleton() {
  return (
    <View style={styles.root}>
      {/* Spend row */}
      <View style={styles.spendRow}>
        {/* Today — gradient bg */}
        <View
          style={[
            styles.spendTodaySkel,
            {
              flex: HOME_SPEND_FLEX.today,
              minHeight: HOME_SPEND_ROW_MIN_HEIGHT,
            },
          ]}
        >
          <SkeletonBlock tone="onPrimary" style={styles.skelLabel} />
          <SkeletonBlock tone="onPrimary" style={styles.skelAmountSm} />
          <View style={styles.chartSkel}>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonBlock
                key={i}
                tone="onPrimary"
                style={[styles.skelBar, { height: 12 + (i % 3) * 8 }]}
              />
            ))}
          </View>
          <SkeletonBlock tone="onPrimary" style={styles.skelSubtext} />
        </View>

        {/* Month — sky pastel bg */}
        <View
          style={[
            styles.spendMonthSkel,
            {
              flex: HOME_SPEND_FLEX.month,
              minHeight: HOME_SPEND_ROW_MIN_HEIGHT,
            },
          ]}
        >
          <SkeletonBlock tone="surface" style={styles.skelLabel} />
          <SkeletonBlock tone="surface" style={styles.skelAmountMd} />
          <View style={styles.ringSkeleton} />
          <SkeletonBlock tone="surface" style={styles.skelSubtext} />
        </View>
      </View>

      {/* Income vs expense tile */}
      <View
        style={[styles.incomeSkel, { minHeight: HOME_INCOME_TILE_MIN_HEIGHT }]}
      >
        <SkeletonBlock tone="surface" style={styles.skelLabel} />
        <View style={styles.incomeStatsSkel}>
          <SkeletonBlock tone="surface" style={styles.skelStatValue} />
          <SkeletonBlock tone="surface" style={styles.skelStatValue} />
          <SkeletonBlock tone="surface" style={styles.skelStatValue} />
        </View>
      </View>

      {/* Category section */}
      <View style={styles.sectionHeaderSkel}>
        <SkeletonBlock tone="surface" style={styles.skelSectionTitle} />
      </View>
      <View style={styles.sectionCardSkel}>
        <View style={styles.catGrid}>
          {[0, 1].map((i) => (
            <View key={i} style={styles.catRowPair}>
              <View
                style={[
                  styles.catTileSkel,
                  { minHeight: HOME_CATEGORY_TILE_MIN_HEIGHT },
                ]}
              >
                <SkeletonBlock tone="surface" style={styles.skelIconChip} />
                <SkeletonBlock tone="surface" style={styles.skelLabel} />
                <SkeletonBlock tone="surface" style={styles.skelAmountSm} />
              </View>
              <View
                style={[
                  styles.catTileSkel,
                  { minHeight: HOME_CATEGORY_TILE_MIN_HEIGHT },
                ]}
              >
                <SkeletonBlock tone="surface" style={styles.skelIconChip} />
                <SkeletonBlock tone="surface" style={styles.skelLabel} />
                <SkeletonBlock tone="surface" style={styles.skelAmountSm} />
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Recent section */}
      <View style={styles.sectionHeaderSkel}>
        <SkeletonBlock tone="surface" style={styles.skelSectionTitle} />
      </View>
      <View style={styles.sectionCardSkel}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.recentTileSkel,
              { minHeight: BENTO_TRANSACTION_TILE_MIN_HEIGHT },
            ]}
          >
            <SkeletonBlock tone="surface" style={styles.skelIconChipSm} />
            <View style={styles.recentTextSkel}>
              <SkeletonBlock tone="surface" style={styles.skelMerchant} />
              <SkeletonBlock tone="surface" style={styles.skelTime} />
            </View>
            <SkeletonBlock tone="surface" style={styles.skelAmountSm} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: BENTO_SECTION_GAP,
  },
  /** Spend row */
  spendRow: {
    flexDirection: "row",
    gap: BENTO_GAP,
  },
  spendTodaySkel: {
    backgroundColor: colors.headerGradientStart,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    opacity: 0.7,
  },
  spendMonthSkel: {
    backgroundColor: bento.monthSpendSurface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    opacity: 0.7,
    justifyContent: "space-between",
  },
  chartSkel: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    flex: 1,
    minHeight: HOME_SPEND_RING_SIZE + spacing.sm,
    marginVertical: spacing.xs,
  },
  skelBar: {
    flex: 1,
    borderRadius: radius.xs,
  },
  ringSkeleton: {
    width: HOME_SPEND_RING_SIZE,
    height: HOME_SPEND_RING_SIZE,
    borderRadius: HOME_SPEND_RING_SIZE / 2,
    borderWidth: 7,
    borderColor: bento.chartOnPastel.track,
    alignSelf: "center",
    marginVertical: spacing.sm,
    opacity: 0.6,
  },
  sectionCardSkel: {
    backgroundColor: bento.sectionSurface,
    borderRadius: radius.lg,
    padding: BENTO_SECTION_CARD_PADDING,
    gap: BENTO_GAP,
  },
  /** Income tile */
  incomeSkel: {
    backgroundColor: bento.incomeExpenseSurface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    opacity: 0.7,
  },
  incomeStatsSkel: {
    flexDirection: "row",
    gap: spacing.xl,
    marginTop: spacing.xs,
  },
  skelStatValue: {
    flex: 1,
    height: 20,
    borderRadius: radius.xs,
  },
  /** Category grid */
  catGrid: {
    gap: BENTO_GAP,
  },
  catRowPair: {
    flexDirection: "row",
    gap: BENTO_GAP,
  },
  catTileSkel: {
    flex: 1,
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  skelIconChip: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
  },
  /** Recent tiles */
  recentTileSkel: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.barBackground,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  skelIconChipSm: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  recentTextSkel: {
    flex: 1,
    gap: spacing.xs,
  },
  /** Generic skeletons */
  skelLabel: {
    height: 12,
    width: "55%",
    borderRadius: radius.xs,
  },
  skelAmountMd: {
    height: 24,
    width: "65%",
    borderRadius: radius.xs,
  },
  skelAmountSm: {
    height: 16,
    width: "50%",
    borderRadius: radius.xs,
  },
  skelSubtext: {
    height: 10,
    width: "80%",
    borderRadius: radius.xs,
    marginTop: spacing.xs,
  },
  skelMerchant: {
    height: 14,
    width: "60%",
    borderRadius: radius.xs,
  },
  skelTime: {
    height: 10,
    width: "40%",
    borderRadius: radius.xs,
  },
  sectionHeaderSkel: {
    marginBottom: -spacing.sm,
  },
  skelSectionTitle: {
    height: 14,
    width: 110,
    borderRadius: radius.xs,
  },
});
