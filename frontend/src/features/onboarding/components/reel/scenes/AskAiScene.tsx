import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles } from "@/theme";
import { formatInrCompact } from "@/utils/currency";

import { ReelText, type ReelSceneProps } from "../ReelParts";
import { easeOut, easeOutBack, seg } from "../reelMotion";
import { CATEGORY_SPEND } from "../reelStory";
import { SCENE_HEIGHT, SCENE_WIDTH } from "../reelStyles";

const ANSWER_AREA_HEIGHT = 104;
const COMPARE_BAR_HEIGHT = 6;
/** This month's spend relative to last month's (₹7,076 is 18% less than last month's ₹8,630). */
const THIS_MONTH_SHARE = 0.82;

// The question pops in, typing dots bounce, the answer replaces them and its bars grow.
const USER_START = 300;
const USER_END = 750;
const DOTS_IN_START = 1050;
const DOTS_IN_END = 1250;
const DOTS_OUT_START = 1850;
const DOTS_OUT_END = 2000;
const ANSWER_START = 1950;
const ANSWER_END = 2400;
const BARS_START = 2450;
const BARS_END = 3050;

function TypingDot({
  clock,
  index,
}: {
  clock: SharedValue<number>;
  index: number;
}) {
  const local = useStyles();
  const style = useAnimatedStyle(() => {
    const wave = Math.max(0, Math.sin(clock.value * 0.012 - index * 0.9));
    return {
      opacity: 0.45 + 0.55 * wave,
      transform: [{ translateY: -3 * wave }],
    };
  });
  return <Animated.View style={[local.dot, style]} />;
}

function CompareBar({
  clock,
  label,
  share,
  current,
}: {
  clock: SharedValue<number>;
  label: string;
  share: number;
  current: boolean;
}) {
  const local = useStyles();
  const fillStyle = useAnimatedStyle(() => ({
    width: `${easeOut(seg(clock.value, BARS_START, BARS_END)) * share * 100}%`,
  }));
  return (
    <View style={local.compareRow}>
      <ReelText style={local.compareLabel}>{label}</ReelText>
      <View style={local.compareTrack}>
        <Animated.View
          style={[local.compareFill, current ? local.fillCurrent : local.fillPast, fillStyle]}
        />
      </View>
    </View>
  );
}

/** Scene 6: a question, typing dots, an answer with a tiny comparison, in the agent chat style. */
export function AskAiScene({ clock }: ReelSceneProps) {
  const local = useStyles();

  const userStyle = useAnimatedStyle(() => {
    const p = seg(clock.value, USER_START, USER_END);
    return {
      opacity: Math.min(1, p * 3),
      transform: [
        { translateY: (1 - easeOutBack(p)) * 12 },
        { scale: 0.92 + easeOutBack(p) * 0.08 },
      ],
    };
  });
  const dotsStyle = useAnimatedStyle(() => {
    const ms = clock.value;
    return {
      opacity: seg(ms, DOTS_IN_START, DOTS_IN_END) * (1 - seg(ms, DOTS_OUT_START, DOTS_OUT_END)),
    };
  });
  const answerStyle = useAnimatedStyle(() => {
    const p = seg(clock.value, ANSWER_START, ANSWER_END);
    return {
      opacity: Math.min(1, p * 3),
      transform: [{ scale: 0.9 + easeOutBack(p) * 0.1 }],
    };
  });

  return (
    <View style={local.scene}>
      <Animated.View style={[local.userBubble, userStyle]}>
        <ReelText style={local.userText}>How much on food this month?</ReelText>
      </Animated.View>

      <View style={local.answerArea}>
        <Animated.View style={[local.assistantBubble, local.dotsBubble, dotsStyle]}>
          {[0, 1, 2].map((i) => (
            <TypingDot key={i} clock={clock} index={i} />
          ))}
        </Animated.View>

        <Animated.View style={[local.assistantBubble, local.answerBubble, answerStyle]}>
          <ReelText style={local.assistantText}>
            <ReelText style={local.number}>
              {formatInrCompact(CATEGORY_SPEND.food)}
            </ReelText>
            {" — 18% less than last month"}
          </ReelText>
          <View style={local.compare}>
            <CompareBar clock={clock} label="Sep" share={1} current={false} />
            <CompareBar clock={clock} label="Oct" share={THIS_MONTH_SHARE} current />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  scene: {
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    justifyContent: "center",
    gap: spacing.md,
  },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "92%",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.accent,
  },
  userText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.onAccent,
  },
  answerArea: {
    height: ANSWER_AREA_HEIGHT,
  },
  /** Assistant bubbles sit on the card surface, so they use the sunken tone to stay visible. */
  assistantBubble: {
    position: "absolute",
    top: 0,
    left: 0,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSunken,
  },
  dotsBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.inkSoft,
  },
  answerBubble: {
    maxWidth: "92%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    transformOrigin: "left top",
  },
  assistantText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  number: {
    fontFamily: fontFamilies.semiBold,
    color: colors.accentText,
  },
  compare: {
    alignSelf: "stretch",
    gap: spacing.xs,
  },
  compareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  compareLabel: {
    width: 24,
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    color: colors.inkFaint,
  },
  compareTrack: {
    flex: 1,
    height: COMPARE_BAR_HEIGHT,
    borderRadius: radius.full,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  compareFill: {
    height: COMPARE_BAR_HEIGHT,
    borderRadius: COMPARE_BAR_HEIGHT / 2,
  },
  fillPast: {
    backgroundColor: colors.accentHeat2,
  },
  fillCurrent: {
    backgroundColor: colors.accent,
  },
}));
