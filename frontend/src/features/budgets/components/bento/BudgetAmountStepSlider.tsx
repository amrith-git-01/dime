import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import { BUDGET_SLIDER_SPRING } from "./budgetEditorBentoTokens";
import {
  BUDGET_STEP_LAST_INDEX,
  getBudgetCheckpointLabels,
  sliderThumbStepIndex,
} from "./budgetEditorPresets";
import { createThemedStyles } from "@/theme";

const THUMB_SIZE = 26;
const TRACK_HEIGHT = 5;
const TRACK_INSET_RATIO = 0.085;

type BudgetAmountStepSliderProps = {
  label: string;
  presets: readonly number[];
  stepIndex: number;
  onStepChange: (index: number) => void;
};

/** UI-thread safe (used inside gesture worklets). */
function clampStepWorklet(index: number): number {
  "worklet";
  return Math.max(0, Math.min(BUDGET_STEP_LAST_INDEX, Math.round(index)));
}

function thumbOffsetForStepWorklet(
  step: number,
  trackWidth: number,
  insetLeft: number,
): number {
  "worklet";
  const center = insetLeft + (step / BUDGET_STEP_LAST_INDEX) * trackWidth;
  return center - THUMB_SIZE / 2;
}

function stepFromThumbOffsetWorklet(
  offset: number,
  trackWidth: number,
  insetLeft: number,
): number {
  "worklet";
  if (trackWidth <= 0) {
    return 0;
  }
  const center = offset + THUMB_SIZE / 2;
  const ratio = (center - insetLeft) / trackWidth;
  return clampStepWorklet(ratio * BUDGET_STEP_LAST_INDEX);
}

function clampStep(index: number): number {
  return clampStepWorklet(index);
}

function thumbOffsetForStep(
  step: number,
  trackWidth: number,
  insetLeft: number,
): number {
  return thumbOffsetForStepWorklet(step, trackWidth, insetLeft);
}

function snapThumbWorklet(thumbX: SharedValue<number>, target: number) {
  "worklet";
  thumbX.value = withSpring(target, {
    damping: 16,
    stiffness: 210,
    mass: 0.85,
  });
}

export const BudgetAmountStepSlider = memo(function BudgetAmountStepSlider({
  label,
  presets,
  stepIndex,
  onStepChange,
}: BudgetAmountStepSliderProps) {
  const styles = useStyles();
  const labels = useMemo(() => getBudgetCheckpointLabels(presets), [presets]);
  const [layoutReady, setLayoutReady] = useState(false);
  const skipStepEffectRef = useRef(false);
  const didInitialStepSyncRef = useRef(false);
  const thumbX = useSharedValue(0);
  const trackWidthSv = useSharedValue(0);
  const insetLeftSv = useSharedValue(0);
  const dragStartX = useSharedValue(0);

  const moveThumbToStep = useCallback(
    (index: number, animate: boolean) => {
      const trackWidth = trackWidthSv.value;
      const insetLeft = insetLeftSv.value;
      if (trackWidth <= 0) {
        return;
      }
      const thumbStep = sliderThumbStepIndex(index);
      const target = thumbOffsetForStep(thumbStep, trackWidth, insetLeft);
      thumbX.value = animate
        ? withSpring(target, BUDGET_SLIDER_SPRING)
        : target;
    },
    [insetLeftSv, thumbX, trackWidthSv],
  );

  const onRailLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const hostWidth = event.nativeEvent.layout.width;
      const insetLeft = hostWidth * TRACK_INSET_RATIO;
      const trackWidth = hostWidth - insetLeft * 2;
      trackWidthSv.value = trackWidth;
      insetLeftSv.value = insetLeft;
      setLayoutReady(trackWidth > 0);
      thumbX.value = thumbOffsetForStep(
        sliderThumbStepIndex(stepIndex),
        trackWidth,
        insetLeft,
      );
    },
    [insetLeftSv, stepIndex, thumbX, trackWidthSv],
  );

  useEffect(() => {
    if (!layoutReady || skipStepEffectRef.current) {
      return;
    }
    const shouldAnimate = didInitialStepSyncRef.current;
    didInitialStepSyncRef.current = true;
    moveThumbToStep(stepIndex, shouldAnimate);
  }, [layoutReady, moveThumbToStep, stepIndex]);

  const commitStep = useCallback(
    (index: number) => {
      const next = clampStep(index);
      skipStepEffectRef.current = true;
      onStepChange(next);
      moveThumbToStep(next, true);
      requestAnimationFrame(() => {
        skipStepEffectRef.current = false;
      });
    },
    [moveThumbToStep, onStepChange],
  );

  const syncStepFromGesture = useCallback(
    (index: number) => {
      const next = clampStep(index);
      skipStepEffectRef.current = true;
      onStepChange(next);
      requestAnimationFrame(() => {
        skipStepEffectRef.current = false;
      });
    },
    [onStepChange],
  );

  const pan = Gesture.Pan()
    .onBegin(() => {
      dragStartX.value = thumbX.value;
    })
    .onUpdate((event) => {
      const trackWidth = trackWidthSv.value;
      const insetLeft = insetLeftSv.value;
      if (trackWidth <= 0) {
        return;
      }
      const minX = thumbOffsetForStepWorklet(0, trackWidth, insetLeft);
      const maxX = thumbOffsetForStepWorklet(
        BUDGET_STEP_LAST_INDEX,
        trackWidth,
        insetLeft,
      );
      const raw = dragStartX.value + event.translationX;
      thumbX.value = Math.max(minX, Math.min(maxX, raw));
    })
    .onEnd(() => {
      const trackWidth = trackWidthSv.value;
      const insetLeft = insetLeftSv.value;
      if (trackWidth <= 0) {
        return;
      }
      const nearest = stepFromThumbOffsetWorklet(
        thumbX.value,
        trackWidth,
        insetLeft,
      );
      const target = thumbOffsetForStepWorklet(nearest, trackWidth, insetLeft);
      snapThumbWorklet(thumbX, target);
      runOnJS(syncStepFromGesture)(nearest);
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbX.value }],
  }));

  const fillStyle = useAnimatedStyle(() => {
    const fillEnd = thumbX.value + THUMB_SIZE / 2 - insetLeftSv.value;
    return {
      width: Math.max(0, fillEnd),
    };
  });

  const handlePressStep = useCallback(
    (index: number) => {
      commitStep(index);
    },
    [commitStep],
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel}>{label}</Text>

      <View style={styles.sliderColumn}>
        <View style={styles.railHost} onLayout={onRailLayout}>
          <View style={styles.trackInset}>
            <View style={styles.trackBg}>
              <Animated.View style={[styles.trackFill, fillStyle]} />
            </View>
          </View>

          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.thumb, thumbStyle]}>
              <View style={styles.thumbInner} />
            </Animated.View>
          </GestureDetector>
        </View>

        <View style={styles.checkpointRow}>
          {labels.map((item, index) => (
            <Pressable
              key={`${item}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Set ${item}`}
              onPress={() => handlePressStep(index)}
              style={styles.checkpointCell}
            >
              <View
                style={[
                  styles.tick,
                  stepIndex === index && stepIndex >= 0 && styles.tickActive,
                ]}
              />
              <Text
                style={[
                  styles.label,
                  stepIndex === index && stepIndex >= 0 && styles.labelActive,
                ]}
                numberOfLines={1}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  wrap: {
    gap: spacing.sm,
  },
  sectionLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sliderColumn: {
    alignSelf: "center",
    width: "92%",
    maxWidth: 340,
  },
  railHost: {
    height: THUMB_SIZE,
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  trackInset: {
    marginHorizontal: `${TRACK_INSET_RATIO * 100}%`,
    height: TRACK_HEIGHT,
    justifyContent: "center",
  },
  trackBg: {
    height: TRACK_HEIGHT,
    borderRadius: radius.full,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  trackFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
  },
  thumb: {
    position: "absolute",
    top: 0,
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
  },
  thumbInner: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.accent,
    ...shadows.pill,
  },
  checkpointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  checkpointCell: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingTop: 2,
  },
  tick: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.line,
  },
  tickActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    color: colors.inkFaint,
    textAlign: "center",
  },
  labelActive: {
    color: colors.accentText,
    fontFamily: fontFamilies.semiBold,
  },
}));
