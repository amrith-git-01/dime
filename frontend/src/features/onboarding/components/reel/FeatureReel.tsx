import { useEffect, useMemo, useRef, type ComponentType } from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { createThemedStyles } from "@/theme";

import { type ReelSceneProps } from "./ReelParts";
import { ReelProgress } from "./ReelProgress";
import { AskAiScene } from "./scenes/AskAiScene";
import { BudgetScene } from "./scenes/BudgetScene";
import { InsightsScene } from "./scenes/InsightsScene";
import { QuickAddScene } from "./scenes/QuickAddScene";
import { ReceiptScene } from "./scenes/ReceiptScene";
import { VoiceScene } from "./scenes/VoiceScene";
import {
  computeReelLayout,
  REEL_CARD_HEIGHT,
  REEL_CARD_WIDTH,
  REEL_SCENE_COUNT,
  REEL_SCENE_MS,
  REEL_SCENES,
  reelAccessibilityLabel,
  resolveSwipe,
  type ReelSceneId,
} from "./reelLogic";
import { useReelController } from "./useReelController";

/** Keyed by scene id, so the order of the reel lives only in `REEL_SCENES`. */
const SCENE_COMPONENTS: Record<ReelSceneId, ComponentType<ReelSceneProps>> = {
  voice: VoiceScene,
  receipt: ReceiptScene,
  quickAdd: QuickAddScene,
  budget: BudgetScene,
  insights: InsightsScene,
  askAi: AskAiScene,
};

const ACCESSIBILITY_ACTIONS = [
  { name: "increment", label: "Next feature" },
  { name: "decrement", label: "Previous feature" },
] as const;

export type FeatureReelProps = {
  /** Room the layout can spare; the reel scales to fit (and hides when there is no room). */
  availableWidth: number;
  availableHeight: number;
  /** Freezes the reel (Google sign-in in progress). */
  paused?: boolean;
};

/**
 * The Welcome screen's looping feature reel: six code-drawn scenes on one card, a segmented
 * progress bar above and a caption below. Auto-advances, swipes, pauses on hold, taps to jump.
 */
export function FeatureReel({
  availableWidth,
  availableHeight,
  paused = false,
}: FeatureReelProps) {
  const styles = useStyles();
  const layout = computeReelLayout(availableWidth, availableHeight);
  const {
    index,
    phase,
    activeGen,
    clock,
    sceneGen,
    fade,
    shift,
    reduceMotion,
    screenReader,
    goNext,
    goPrev,
    jumpTo,
    setPressHeld,
    setDragHeld,
  } = useReelController({ paused: paused || !layout.visible });

  const caption = REEL_SCENES[index].caption;

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Android announces the caption through its live region; iOS has none.
    if (screenReader && Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(caption);
    }
  }, [index, caption, screenReader]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-12, 12])
      .failOffsetY([-14, 14])
      .onStart(() => setDragHeld(true))
      .onEnd((event) => {
        const direction = resolveSwipe(event.translationX, event.velocityX);
        if (direction === 1) {
          goNext(true);
        } else if (direction === -1) {
          goPrev(true);
        }
      })
      .onFinalize(() => setDragHeld(false));
    const hold = Gesture.LongPress()
      .runOnJS(true)
      .minDuration(220)
      .maxDistance(40)
      .onStart(() => setPressHeld(true))
      .onFinalize(() => setPressHeld(false));
    return Gesture.Simultaneous(pan, hold);
  }, [goNext, goPrev, setDragHeld, setPressHeld]);

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "increment") {
      goNext(false);
    } else if (event.nativeEvent.actionName === "decrement") {
      goPrev(false);
    }
  };

  const sceneStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: shift.value }],
  }));
  const captionStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (!layout.visible) {
    return null;
  }

  const Scene = SCENE_COMPONENTS[REEL_SCENES[index].id];

  return (
    <View style={{ width: layout.width }}>
      <View style={styles.progress}>
        <ReelProgress
          count={REEL_SCENE_COUNT}
          activeIndex={index}
          reduceMotion={reduceMotion}
          phase={phase}
          clock={clock}
          sceneGen={sceneGen}
          activeGen={activeGen}
          onSelect={jumpTo}
        />
      </View>

      <GestureDetector gesture={gesture}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={reelAccessibilityLabel(index)}
          accessibilityActions={ACCESSIBILITY_ACTIONS}
          onAccessibilityAction={onAccessibilityAction}
          style={[styles.card, { width: layout.width, height: layout.height }]}
        >
          <View
            style={[
              styles.design,
              {
                left: (layout.width - REEL_CARD_WIDTH) / 2,
                top: -(REEL_CARD_HEIGHT - layout.height) / 2,
                transform: [{ scale: layout.scale }],
              },
            ]}
          >
            <Animated.View
              style={sceneStyle}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              <Scene
                key={index}
                clock={clock}
                initialMs={reduceMotion ? REEL_SCENE_MS : 0}
              />
            </Animated.View>
          </View>
        </View>
      </GestureDetector>

      <Animated.Text
        accessibilityLiveRegion="polite"
        maxFontSizeMultiplier={1.2}
        numberOfLines={1}
        style={[styles.caption, captionStyle]}
      >
        {caption}
      </Animated.Text>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  progress: {
    marginBottom: spacing.md,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  design: {
    position: "absolute",
    width: REEL_CARD_WIDTH,
    height: REEL_CARD_HEIGHT,
    padding: spacing.lg,
  },
  caption: {
    marginTop: spacing.md,
    fontFamily: fontFamilies.semiBold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.ink,
  },
}));
