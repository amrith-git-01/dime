import { View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles } from "@/theme";
import { formatInrCompact } from "@/utils/currency";

import { ReelText, type ReelSceneProps } from "../ReelParts";
import { easeOut, seg } from "../reelMotion";
import { SCENE_HEIGHT, SCENE_WIDTH } from "../reelStyles";
import { useClockValue } from "../useClockValue";

const BUDGET = 30000;
const SPENT = 18623;
const RECURRING = 9200;
const FLEXIBLE = SPENT - RECURRING;
const FINAL_PROGRESS = SPENT / BUDGET;
const BAR_HEIGHT = 5;

// The card settles in, the bar fills to ~62% while the numbers count, then the split fades in.
const ENTER_END = 450;
const FILL_START = 500;
const FILL_END = 2300;
const SPLIT_START = 2300;
const SPLIT_END = 2700;

function readSpent(ms: number): number {
  "worklet";
  return Math.round(SPENT * easeOut(seg(ms, FILL_START, FILL_END)));
}

/** Scene 4: the month budget card (as on Home): the bar fills and "left of" counts down. */
export function BudgetScene({ clock, initialMs }: ReelSceneProps) {
  const local = useStyles();
  const spent = useClockValue(clock, readSpent, initialMs);
  const left = BUDGET - spent;
  const used = Math.round((spent / BUDGET) * 100);

  const groupStyle = useAnimatedStyle(() => {
    const p = easeOut(seg(clock.value, 0, ENTER_END));
    return { opacity: p, transform: [{ translateY: (1 - p) * 10 }] };
  });
  const fillStyle = useAnimatedStyle(() => ({
    width: `${easeOut(seg(clock.value, FILL_START, FILL_END)) * FINAL_PROGRESS * 100}%`,
  }));
  const splitStyle = useAnimatedStyle(() => ({
    opacity: seg(clock.value, SPLIT_START, SPLIT_END),
  }));

  return (
    <View style={local.scene}>
      <Animated.View style={[local.group, groupStyle]}>
        <View style={local.headerRow}>
          <ReelText style={local.eyebrow}>THIS MONTH</ReelText>
          <ReelText style={local.monthLabel}>Monthly budget</ReelText>
        </View>
        <ReelText style={local.heroAmount}>{formatInrCompact(spent)}</ReelText>
        <Animated.View style={splitStyle}>
          <ReelText style={local.splitLine}>
            {`Recurring ${formatInrCompact(RECURRING)} · Flexible ${formatInrCompact(FLEXIBLE)}`}
          </ReelText>
        </Animated.View>
        <ReelText style={local.statusLine}>
          {`${formatInrCompact(left)} left of ${formatInrCompact(BUDGET)}`}
          <ReelText style={local.statusLineMuted}>{` · ${used}% used`}</ReelText>
        </ReelText>
        <View style={local.track}>
          <Animated.View style={[local.fill, fillStyle]} />
        </View>
      </Animated.View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  scene: {
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    justifyContent: "center",
  },
  group: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.7,
    color: colors.inkFaint,
  },
  monthLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  heroAmount: {
    fontFamily: fontFamilies.bold,
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.8,
    color: colors.accentText,
    fontVariant: ["tabular-nums"],
    marginTop: spacing.xs,
  },
  splitLine: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
  },
  statusLine: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
  },
  statusLineMuted: {
    color: colors.inkFaint,
  },
  track: {
    marginTop: spacing.xs,
    height: BAR_HEIGHT,
    borderRadius: radius.full,
    overflow: "hidden",
    backgroundColor: colors.surfaceSunken,
  },
  fill: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: colors.accent,
  },
}));
