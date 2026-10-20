import { Canvas, Circle, Path, Skia } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import { radius, readableCategoryColor, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles, useTheme } from "@/theme";

import { REEL_CATEGORIES, ReelText, type ReelSceneProps } from "../ReelParts";
import { easeInOut, easeOut, seg } from "../reelMotion";
import { CATEGORY_SPEND } from "../reelStory";
import { SCENE_HEIGHT, SCENE_WIDTH } from "../reelStyles";

const MONTHS = ["May", "Jun", "Jul", "Aug", "Sep", "Oct"] as const;
/** Relative spend per month; the current month (last) is the accent bar, month-to-date. */
const MONTH_SPEND = [0.52, 0.68, 0.45, 0.8, 0.92, 0.72] as const;
const BAR_AREA_HEIGHT = 56;

const DONUT_SIZE = 104;
const DONUT_STROKE = 16;
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE) / 2;
const DONUT_CENTER = DONUT_SIZE / 2;
const SLICE_GAP_DEG = 3;
const DONUT_START_DEG = -90;

// Bars grow with a stagger, then the donut draws itself clockwise and the legend follows.
const TITLE_END = 300;
const BAR_START = 250;
const BAR_STAGGER = 110;
const BAR_MS = 500;
const DONUT_START = 1500;
const DONUT_END = 2700;
const LEGEND_START = 1700;
const LEGEND_STAGGER = 220;
const LEGEND_MS = 300;

type SliceSpec = {
  key: string;
  label: string;
  share: number;
};

const SPEND_TOTAL =
  CATEGORY_SPEND.food +
  CATEGORY_SPEND.shopping +
  CATEGORY_SPEND.transport +
  CATEGORY_SPEND.other;

const SLICES: readonly SliceSpec[] = [
  { key: "food", label: REEL_CATEGORIES.food.name, share: CATEGORY_SPEND.food / SPEND_TOTAL },
  {
    key: "shopping",
    label: REEL_CATEGORIES.shopping.name,
    share: CATEGORY_SPEND.shopping / SPEND_TOTAL,
  },
  {
    key: "transport",
    label: REEL_CATEGORIES.transport.name,
    share: CATEGORY_SPEND.transport / SPEND_TOTAL,
  },
  { key: "other", label: "Other", share: CATEGORY_SPEND.other / SPEND_TOTAL },
];

function MonthBar({
  clock,
  index,
  highlighted,
}: {
  clock: SharedValue<number>;
  index: number;
  highlighted: boolean;
}) {
  const local = useStyles();
  const style = useAnimatedStyle(() => {
    const start = BAR_START + index * BAR_STAGGER;
    return {
      height:
        MONTH_SPEND[index] * BAR_AREA_HEIGHT * easeOut(seg(clock.value, start, start + BAR_MS)),
    };
  });
  return (
    <View style={local.barColumn}>
      <View style={local.barArea}>
        <Animated.View
          style={[local.bar, highlighted ? local.barCurrent : local.barPast, style]}
        />
      </View>
      <ReelText style={local.barLabel}>{MONTHS[index]}</ReelText>
    </View>
  );
}

function DonutArc({
  progress,
  startShare,
  share,
  color,
}: {
  progress: SharedValue<number>;
  startShare: number;
  share: number;
  color: string;
}) {
  const path = useMemo(() => {
    const arc = Skia.Path.Make();
    arc.addArc(
      Skia.XYWHRect(
        DONUT_CENTER - DONUT_RADIUS,
        DONUT_CENTER - DONUT_RADIUS,
        DONUT_RADIUS * 2,
        DONUT_RADIUS * 2,
      ),
      DONUT_START_DEG + startShare * 360 + SLICE_GAP_DEG / 2,
      share * 360 - SLICE_GAP_DEG,
    );
    return arc;
  }, [startShare, share]);

  // Constant angular speed: each slice draws while the sweep passes over it.
  const end = useDerivedValue(() =>
    Math.min(1, Math.max(0, (progress.value - startShare) / share)),
  );

  return (
    <Path
      path={path}
      style="stroke"
      strokeWidth={DONUT_STROKE}
      color={color}
      start={0}
      end={end}
    />
  );
}

function LegendItem({
  clock,
  index,
  label,
  share,
  color,
}: {
  clock: SharedValue<number>;
  index: number;
  label: string;
  share: number;
  color: string;
}) {
  const local = useStyles();
  const style = useAnimatedStyle(() => {
    const start = LEGEND_START + index * LEGEND_STAGGER;
    const p = easeOut(seg(clock.value, start, start + LEGEND_MS));
    return { opacity: p, transform: [{ translateX: (1 - p) * 8 }] };
  });
  return (
    <Animated.View style={[local.legendRow, style]}>
      <View style={[local.legendDot, { backgroundColor: color }]} />
      <ReelText numberOfLines={1} style={local.legendLabel}>
        {label}
      </ReelText>
      <ReelText style={local.legendShare}>{`${Math.round(share * 100)}%`}</ReelText>
    </Animated.View>
  );
}

/** Scene 5: monthly bars grow, then a donut of category colors draws itself with a legend. */
export function InsightsScene({ clock }: ReelSceneProps) {
  const local = useStyles();
  const { colors, scheme } = useTheme();

  const donutProgress = useDerivedValue(() =>
    easeInOut(seg(clock.value, DONUT_START, DONUT_END)),
  );
  const titleStyle = useAnimatedStyle(() => ({
    opacity: seg(clock.value, 0, TITLE_END),
  }));

  const sliceColors = SLICES.map((slice) =>
    slice.key === "other"
      ? colors.donut.other
      : readableCategoryColor(
          REEL_CATEGORIES[slice.key as keyof typeof REEL_CATEGORIES].color,
          scheme,
        ),
  );

  let cumulative = 0;
  const arcs = SLICES.map((slice, i) => {
    const arc = { slice, color: sliceColors[i], startShare: cumulative };
    cumulative += slice.share;
    return arc;
  });

  return (
    <View style={local.scene}>
      <View style={local.barsBlock}>
        <Animated.View style={titleStyle}>
          <ReelText style={local.title}>Last 6 months</ReelText>
        </Animated.View>
        <View style={local.barsRow}>
          {MONTHS.map((month, i) => (
            <MonthBar
              key={month}
              clock={clock}
              index={i}
              highlighted={i === MONTHS.length - 1}
            />
          ))}
        </View>
      </View>

      <View style={local.donutRow}>
        <Canvas style={local.canvas}>
          <Circle
            cx={DONUT_CENTER}
            cy={DONUT_CENTER}
            r={DONUT_RADIUS}
            style="stroke"
            strokeWidth={DONUT_STROKE}
            color={colors.surfaceSunken}
          />
          {arcs.map(({ slice, color, startShare }) => (
            <DonutArc
              key={slice.key}
              progress={donutProgress}
              startShare={startShare}
              share={slice.share}
              color={color}
            />
          ))}
        </Canvas>
        <View style={local.legend}>
          {arcs.map(({ slice, color }, i) => (
            <LegendItem
              key={slice.key}
              clock={clock}
              index={i}
              label={slice.label}
              share={slice.share}
              color={color}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  scene: {
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    justifyContent: "center",
    gap: spacing.lg,
  },
  barsBlock: {
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  barsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  barColumn: {
    flex: 1,
    alignItems: "stretch",
    gap: spacing.xs,
  },
  barArea: {
    height: BAR_AREA_HEIGHT,
    justifyContent: "flex-end",
  },
  bar: {
    borderRadius: radius.sm,
  },
  barPast: {
    backgroundColor: colors.accentHeat2,
  },
  barCurrent: {
    backgroundColor: colors.accent,
  },
  barLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
    color: colors.inkFaint,
  },
  donutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
  },
  canvas: {
    width: DONUT_SIZE,
    height: DONUT_SIZE,
  },
  legend: {
    flex: 1,
    gap: spacing.sm,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  legendLabel: {
    flex: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  legendShare: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
  },
}));
