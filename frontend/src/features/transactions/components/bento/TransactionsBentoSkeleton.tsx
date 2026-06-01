import { StyleSheet, View } from "react-native";

import {
  BENTO_GAP,
  BENTO_SECTION_CARD_PADDING,
  BENTO_SECTION_GAP,
  BENTO_TRANSACTION_TILE_MIN_HEIGHT,
} from "@/components/bento";
import { SkeletonListRow } from "@/components/shared";
import { SkeletonBlock } from "@/components/ui";
import { bento, colors, radius, spacing } from "@/constants";

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
            style={index > 0 && { marginTop: BENTO_GAP }}
          >
            <SkeletonListRow
              minHeight={BENTO_TRANSACTION_TILE_MIN_HEIGHT}
              iconSize={38}
              gap={8}
            />
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
  monthCard: {
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  monthHeaderSkel: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    backgroundColor: bento.twoToneHeaderSurface,
    padding: BENTO_SECTION_CARD_PADDING,
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
    width: 120,
    height: 28,
    borderRadius: radius.sm,
  },
  monthCashFlowSkel: {
    padding: BENTO_SECTION_CARD_PADDING,
    paddingTop: spacing.md,
    backgroundColor: bento.twoToneBodySurface,
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
    padding: BENTO_SECTION_CARD_PADDING,
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
    padding: BENTO_SECTION_CARD_PADDING,
  },
});
