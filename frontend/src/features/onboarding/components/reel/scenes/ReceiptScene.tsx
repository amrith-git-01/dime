import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { radius, spacing, withAlpha } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles } from "@/theme";
import { formatInrCompact } from "@/utils/currency";

import {
  CategoryTile,
  REEL_CATEGORIES,
  ReelText,
  type ReelSceneProps,
} from "../ReelParts";
import { easeInOut, easeOut, seg } from "../reelMotion";
import { REEL_PAYEES } from "../reelStory";
import { ROW_HEIGHT, SCENE_HEIGHT, SCENE_WIDTH, useReelStyles } from "../reelStyles";

const PAPER_WIDTH = 152;
const PAPER_HEIGHT = 164;
const BAND_STEPS = 6;
const BAND_STEP_HEIGHT = 5;
const BAND_HEIGHT = BAND_STEPS * BAND_STEP_HEIGHT;
const LINE_HEIGHT = 2;
const ITEM_BARS = [
  [58, 26],
  [78, 26],
  [46, 26],
  [66, 26],
] as const;

// The receipt arrives, a scan line sweeps it top to bottom and "reads" the shop name and the
// total, both highlight and fly down into a transaction row.
const PAPER_END = 500;
const SCAN_START = 650;
const SCAN_END = 1950;
const NAME_READ_START = 820;
const NAME_READ_END = 900;
const TOTAL_READ_START = 1780;
const TOTAL_READ_END = 1860;
const HIGHLIGHT_START = 2050;
const HIGHLIGHT_END = 2450;
const FLY_START = 2550;
const FLY_END = 3000;
const ROW_START = 2700;
const ROW_END = 3200;

/** Where the highlighted shop name / total end up: the title and the amount of the new row. */
const NAME_FLIGHT = { x: -75, y: 177 } as const;
const TOTAL_FLIGHT = { x: 80, y: 71 } as const;

/** Scene 2: a scan line reads a receipt; the shop and total move into a row. */
export function ReceiptScene({ clock }: ReelSceneProps) {
  const styles = useReelStyles();
  const local = useStyles();
  const food = REEL_CATEGORIES.food;

  const paperStyle = useAnimatedStyle(() => {
    const p = easeOut(seg(clock.value, 0, PAPER_END));
    return {
      opacity: p,
      transform: [{ translateY: (1 - p) * 14 }, { scale: 0.96 + p * 0.04 }],
    };
  });
  const scanStyle = useAnimatedStyle(() => {
    const ms = clock.value;
    const p = easeInOut(seg(ms, SCAN_START, SCAN_END));
    return {
      opacity: seg(ms, SCAN_START - 150, SCAN_START) * (1 - seg(ms, SCAN_END, SCAN_END + 200)),
      transform: [{ translateY: p * PAPER_HEIGHT - BAND_HEIGHT - LINE_HEIGHT }],
    };
  });

  const nameBarStyle = useAnimatedStyle(() => {
    const ms = clock.value;
    return {
      opacity: Math.max(
        1 - seg(ms, NAME_READ_START, NAME_READ_END),
        seg(ms, FLY_END - 200, FLY_END + 100),
      ),
    };
  });
  const totalBarStyle = useAnimatedStyle(() => {
    const ms = clock.value;
    return {
      opacity: Math.max(
        1 - seg(ms, TOTAL_READ_START, TOTAL_READ_END),
        seg(ms, FLY_END - 200, FLY_END + 100),
      ),
    };
  });

  const nameChipStyle = useAnimatedStyle(() => {
    const ms = clock.value;
    const fly = easeInOut(seg(ms, FLY_START, FLY_END));
    return {
      opacity: seg(ms, NAME_READ_START, NAME_READ_END) * (1 - seg(ms, FLY_END - 200, FLY_END)),
      transform: [
        { translateX: NAME_FLIGHT.x * fly },
        { translateY: NAME_FLIGHT.y * fly },
        { scale: 1 + 0.1 * Math.sin(Math.PI * seg(ms, HIGHLIGHT_START, HIGHLIGHT_END)) },
      ],
    };
  });
  const totalChipStyle = useAnimatedStyle(() => {
    const ms = clock.value;
    const fly = easeInOut(seg(ms, FLY_START, FLY_END));
    return {
      opacity: seg(ms, TOTAL_READ_START, TOTAL_READ_END) * (1 - seg(ms, FLY_END - 200, FLY_END)),
      transform: [
        { translateX: TOTAL_FLIGHT.x * fly },
        { translateY: TOTAL_FLIGHT.y * fly },
        { scale: 1 + 0.1 * Math.sin(Math.PI * seg(ms, HIGHLIGHT_START, HIGHLIGHT_END)) },
      ],
    };
  });
  const highlightStyle = useAnimatedStyle(() => ({
    opacity: easeOut(seg(clock.value, HIGHLIGHT_START, HIGHLIGHT_END)),
  }));

  const rowStyle = useAnimatedStyle(() => {
    const p = easeOut(seg(clock.value, ROW_START, ROW_END));
    return { opacity: p, transform: [{ translateY: (1 - p) * 12 }] };
  });

  return (
    <View style={styles.scene}>
      {/* The new row sits under the receipt so the flying highlights pass over it. */}
      <Animated.View style={[local.row, styles.entry, rowStyle]}>
        <CategoryTile category={food} />
        <View style={styles.rowText}>
          <ReelText style={styles.rowTitle}>{REEL_PAYEES.smoor.title}</ReelText>
          <ReelText style={styles.rowMeta}>{food.name}</ReelText>
        </View>
        <ReelText style={styles.rowAmount}>
          {formatInrCompact(REEL_PAYEES.smoor.amount)}
        </ReelText>
      </Animated.View>

      <Animated.View style={[local.paper, paperStyle]}>
        <View style={local.nameBlock}>
          <Animated.View style={[local.bar, local.nameBar, nameBarStyle]} />
          <Animated.View style={[local.chip, nameChipStyle]}>
            <Animated.View style={[local.chipHighlight, highlightStyle]} />
            <ReelText style={local.chipText}>{REEL_PAYEES.smoor.title}</ReelText>
          </Animated.View>
        </View>

        <View style={local.items}>
          {ITEM_BARS.map(([left, right], i) => (
            <View key={i} style={local.itemRow}>
              <View style={[local.bar, { width: left }]} />
              <View style={[local.bar, { width: right }]} />
            </View>
          ))}
        </View>

        <View style={local.divider} />

        <View style={local.totalRow}>
          <View style={[local.bar, { width: 34 }]} />
          <View style={local.totalBlock}>
            <Animated.View style={[local.bar, local.totalBar, totalBarStyle]} />
            <Animated.View style={[local.chip, local.totalChip, totalChipStyle]}>
              <Animated.View style={[local.chipHighlight, highlightStyle]} />
              <ReelText style={local.chipText}>
                {formatInrCompact(REEL_PAYEES.smoor.amount)}
              </ReelText>
            </Animated.View>
          </View>
        </View>

        <View pointerEvents="none" style={local.scanClip}>
          <Animated.View style={[local.scan, scanStyle]}>
            {Array.from({ length: BAND_STEPS }, (_, i) => (
              <View
                key={i}
                style={[
                  local.bandStep,
                  { opacity: ((i + 1) / BAND_STEPS) * 0.22 },
                ]}
              />
            ))}
            <View style={local.scanLine} />
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  row: {
    position: "absolute",
    left: -spacing.sm,
    width: SCENE_WIDTH + spacing.lg,
    top: SCENE_HEIGHT - ROW_HEIGHT,
  },
  paper: {
    position: "absolute",
    top: 0,
    left: (SCENE_WIDTH - PAPER_WIDTH) / 2,
    width: PAPER_WIDTH,
    height: PAPER_HEIGHT,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSunken,
  },
  bar: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: withAlpha(colors.inkSoft, 0.28),
  },
  nameBlock: {
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  nameBar: {
    width: 64,
    height: 8,
  },
  items: {
    marginTop: 14,
    gap: 10,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  divider: {
    marginTop: 14,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
  totalRow: {
    marginTop: spacing.md,
    height: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalBlock: {
    width: 60,
    height: 20,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  totalBar: {
    width: 44,
    height: 10,
  },
  chip: {
    position: "absolute",
    paddingVertical: 1,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  totalChip: {
    right: -spacing.sm,
  },
  chipHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.sm,
    backgroundColor: colors.accentHeat2,
  },
  chipText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  scanClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    borderRadius: radius.sm,
  },
  scan: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
  },
  bandStep: {
    height: BAND_STEP_HEIGHT,
    backgroundColor: colors.accentText,
  },
  scanLine: {
    height: LINE_HEIGHT,
    backgroundColor: colors.accentText,
  },
}));
