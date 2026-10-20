import { Mic } from "lucide-react-native";
import { View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { radius, spacing } from "@/constants";
import { createThemedStyles, useTheme } from "@/theme";
import { formatInrCompact } from "@/utils/currency";

import {
  CategoryTile,
  REEL_CATEGORIES,
  ReelPayeeRow,
  ReelText,
  type ReelSceneProps,
} from "../ReelParts";
import { easeInOut, easeOut, easeOutBack, seg } from "../reelMotion";
import { REEL_PAYEES } from "../reelStory";
import { HEADER_HEIGHT, useReelStyles } from "../reelStyles";
import { useClockValue } from "../useClockValue";

const TRANSCRIPT = "250 for lunch at Swiggy";
const BAR_COUNT = 15;
const BAR_HEIGHT = 36;
const MIC_SIZE = 48;
const RING_PERIOD_MS = 900;

// Mic is pressed, rings pulse and the wave moves while the text writes itself, then the
// transcript collapses into a transaction row.
const PRESS_START = 150;
const PRESS_END = 500;
const RING_START = 450;
const SPEECH_START = 650;
const SPEECH_END = 2250;
const TEXT_START = 750;
const TEXT_END = 2250;
const COLLAPSE_START = 2500;
const COLLAPSE_END = 2900;
const ROW_START = 2650;
const ROW_END = 3150;

function readChars(ms: number): number {
  "worklet";
  return Math.floor(seg(ms, TEXT_START, TEXT_END) * TRANSCRIPT.length);
}

function PulseRing({
  clock,
  offsetMs,
}: {
  clock: ReelSceneProps["clock"];
  offsetMs: number;
}) {
  const local = useStyles();
  const style = useAnimatedStyle(() => {
    const ms = clock.value;
    const live =
      seg(ms, RING_START, RING_START + 200) *
      (1 - seg(ms, SPEECH_END, SPEECH_END + 300));
    const phase =
      ((((ms - RING_START - offsetMs) % RING_PERIOD_MS) + RING_PERIOD_MS) %
        RING_PERIOD_MS) /
      RING_PERIOD_MS;
    return {
      opacity: live * (1 - phase) * 0.8,
      transform: [{ scale: 1 + phase * 0.9 }],
    };
  });
  return <Animated.View style={[local.ring, style]} />;
}

function WaveBar({
  clock,
  index,
}: {
  clock: ReelSceneProps["clock"];
  index: number;
}) {
  const local = useStyles();
  const style = useAnimatedStyle(() => {
    const ms = clock.value;
    const envelope =
      easeInOut(seg(ms, SPEECH_START, SPEECH_START + 250)) *
      (1 - easeInOut(seg(ms, SPEECH_END, SPEECH_END + 250)));
    const wobble =
      0.3 +
      0.7 * Math.abs(Math.sin(ms * 0.012 + index * 0.85) * Math.cos(ms * 0.007 + index * 0.5));
    const taper = 1 - Math.abs(index - (BAR_COUNT - 1) / 2) / BAR_COUNT;
    return { transform: [{ scaleY: 0.12 + 0.88 * envelope * wobble * taper }] };
  });
  return <Animated.View style={[local.bar, style]} />;
}

/** Scene 1: a mic pulses, "250 for lunch at Swiggy" writes itself, then it becomes a row. */
export function VoiceScene({ clock, initialMs }: ReelSceneProps) {
  const styles = useReelStyles();
  const local = useStyles();
  const { colors } = useTheme();
  const food = REEL_CATEGORIES.food;

  const chars = useClockValue(clock, readChars, initialMs);

  const micStyle = useAnimatedStyle(() => {
    const ms = clock.value;
    const down = easeOut(seg(ms, PRESS_START, PRESS_START + 110));
    const up = easeOutBack(seg(ms, PRESS_START + 110, PRESS_END));
    return { transform: [{ scale: 1 - 0.12 * down + 0.12 * up }] };
  });
  const transcriptStyle = useAnimatedStyle(() => {
    const p = easeInOut(seg(clock.value, COLLAPSE_START, COLLAPSE_END));
    return { opacity: 1 - p, transform: [{ translateY: -10 * p }] };
  });
  const rowStyle = useAnimatedStyle(() => {
    const p = easeOut(seg(clock.value, ROW_START, ROW_END));
    return { opacity: p, transform: [{ translateY: (1 - p) * 10 }] };
  });

  return (
    <View style={styles.scene}>
      <View style={local.stage}>
        <View style={local.micWrap}>
          <PulseRing clock={clock} offsetMs={0} />
          <PulseRing clock={clock} offsetMs={RING_PERIOD_MS / 2} />
          <Animated.View style={[local.mic, micStyle]}>
            <Mic size={22} color={colors.onAccent} strokeWidth={2} />
          </Animated.View>
        </View>
        <View style={local.wave}>
          {Array.from({ length: BAR_COUNT }, (_, i) => (
            <WaveBar key={i} clock={clock} index={i} />
          ))}
        </View>
      </View>

      <View style={styles.list}>
        <View style={styles.entry}>
          <Animated.View style={[styles.entryLayer, transcriptStyle]}>
            <ReelText style={styles.rowTitle}>
              {TRANSCRIPT.slice(0, chars)}
            </ReelText>
          </Animated.View>
          <Animated.View style={[styles.entryLayer, rowStyle]}>
            <CategoryTile category={food} />
            <View style={styles.rowText}>
              <ReelText style={styles.rowTitle}>{REEL_PAYEES.swiggy.title}</ReelText>
              <ReelText style={styles.rowMeta}>{food.name}</ReelText>
            </View>
            <ReelText style={styles.rowAmount}>{formatInrCompact(REEL_PAYEES.swiggy.amount)}</ReelText>
          </Animated.View>
        </View>

        <ReelPayeeRow payee={REEL_PAYEES.rapido} />
        <ReelPayeeRow payee={REEL_PAYEES.zepto} />
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  stage: {
    height: HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  micWrap: {
    width: MIC_SIZE,
    height: MIC_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  mic: {
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  ring: {
    position: "absolute",
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: radius.full,
    backgroundColor: colors.accentHeat2,
  },
  wave: {
    flex: 1,
    height: BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  bar: {
    width: 4,
    height: BAR_HEIGHT,
    borderRadius: radius.full,
    backgroundColor: colors.accentText,
  },
}));
