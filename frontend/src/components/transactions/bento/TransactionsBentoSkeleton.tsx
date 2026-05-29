import { StyleSheet, View } from "react-native";

import {
  HOME_BENTO_GAP,
  HOME_BENTO_SECTION_GAP,
  HOME_RECENT_TILE_MIN_HEIGHT,
  HOME_SECTION_CARD_PADDING,
} from "@/components/home/bento/homeBentoTokens";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { bento, colors, radius, spacing } from "@/constants/theme";

/**
 * Shape-matched loading skeleton for Transactions bento header + day rows.
 */
export function TransactionsBentoSkeleton() {
  return (
    <View style={styles.root}>
      <View style={styles.monthCard}>
        <View style={styles.monthHeaderSkel}>
          <View style={styles.monthHeaderLeftSkel}>
            <SkeletonBlock tone="surface" style={styles.monthKickerSkel} />
            <SkeletonBlock tone="surface" style={styles.monthCountSkel} />
          </View>
          <SkeletonBlock tone="surface" style={styles.monthDropdownSkel} />
        </View>
        <View style={styles.monthCashFlowSkel}>
          <SkeletonBlock
            tone="surface"
            style={styles.monthCashFlowKickerSkel}
          />
          <View style={styles.monthCashFlowStatsSkel}>
            <SkeletonBlock
              tone="surface"
              style={styles.monthCashFlowStatSkel}
            />
            <SkeletonBlock
              tone="surface"
              style={styles.monthCashFlowStatSkel}
            />
            <SkeletonBlock
              tone="surface"
              style={styles.monthCashFlowStatSkel}
            />
          </View>
        </View>
      </View>

      <View style={styles.dayBar}>
        <SkeletonBlock tone="surface" style={styles.dayChevronSkel} />
        <View style={styles.dayCenterSkel}>
          <SkeletonBlock tone="surface" style={styles.dayTitleSkel} />
          <SkeletonBlock tone="surface" style={styles.daySubtitleSkel} />
        </View>
        <SkeletonBlock tone="surface" style={styles.dayChevronSkel} />
      </View>

      <View style={styles.listCard}>
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            style={[styles.rowSkel, index > 0 && { marginTop: HOME_BENTO_GAP }]}
          >
            <SkeletonBlock tone="surface" style={styles.rowIconSkel} />
            <View style={styles.rowTextSkel}>
              <SkeletonBlock tone="surface" style={styles.rowTitleSkel} />
              <SkeletonBlock tone="surface" style={styles.rowSubSkel} />
            </View>
            <SkeletonBlock tone="surface" style={styles.rowAmountSkel} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: HOME_BENTO_SECTION_GAP,
  },
  monthCard: {
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  monthHeaderSkel: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    backgroundColor: bento.monthSpendSurface,
    padding: HOME_SECTION_CARD_PADDING,
    paddingBottom: spacing.md,
  },
  monthHeaderLeftSkel: {
    flex: 1,
    gap: 6,
  },
  monthKickerSkel: {
    width: 72,
    height: 10,
    borderRadius: radius.sm,
  },
  monthCountSkel: {
    width: "55%",
    height: 22,
    borderRadius: radius.sm,
  },
  monthDropdownSkel: {
    width: 118,
    height: 48,
    borderRadius: radius.sm,
  },
  monthCashFlowSkel: {
    padding: HOME_SECTION_CARD_PADDING,
    paddingTop: spacing.md,
    backgroundColor: bento.incomeExpenseSurface,
    gap: spacing.sm,
  },
  monthCashFlowKickerSkel: {
    width: 64,
    height: 10,
    borderRadius: radius.sm,
  },
  monthCashFlowStatsSkel: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  monthCashFlowStatSkel: {
    flex: 1,
    height: 36,
    borderRadius: radius.sm,
  },
  dayBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: bento.sectionSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: HOME_SECTION_CARD_PADDING,
    gap: 8,
  },
  dayChevronSkel: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
  },
  dayCenterSkel: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  dayTitleSkel: {
    width: "70%",
    height: 16,
    borderRadius: radius.sm,
  },
  daySubtitleSkel: {
    width: "45%",
    height: 10,
    borderRadius: radius.sm,
  },
  listCard: {
    backgroundColor: bento.sectionSurface,
    borderRadius: radius.lg,
    padding: HOME_SECTION_CARD_PADDING,
  },
  rowSkel: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: HOME_RECENT_TILE_MIN_HEIGHT,
    gap: 8,
  },
  rowIconSkel: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
  },
  rowTextSkel: {
    flex: 1,
    gap: 6,
  },
  rowTitleSkel: {
    width: "55%",
    height: 14,
    borderRadius: radius.sm,
  },
  rowSubSkel: {
    width: "40%",
    height: 11,
    borderRadius: radius.sm,
  },
  rowAmountSkel: {
    width: 56,
    height: 14,
    borderRadius: radius.sm,
  },
});
