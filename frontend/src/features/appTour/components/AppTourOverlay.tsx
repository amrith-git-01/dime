import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  BackHandler,
  findNodeHandle,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import {
  Easing,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { springs } from "@/constants/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import {
  triggerConfirmHaptic,
  triggerHaptic,
  triggerTickHaptic,
} from "@/lib/haptics/nativeHaptics";
import { measureTourTarget } from "@/lib/tour/tourTargetRegistry";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";
import { useCelebrationStore } from "@/stores/celebrationStore";

import {
  getTourActionStepNumber,
  TOUR_ACTION_STEP_COUNT,
  TOUR_STEPS,
} from "../constants/tourSteps";
import { useTourPaused } from "../hooks/useTourPaused";
import { useTourTargetRect } from "../hooks/useTourTargetRect";
import { useAppTourStore } from "../store/appTourStore";
import { getTourMotion, TOUR_SPARKLE_TRAIL } from "../utils/tourMotion";
import { runTourCardAction, runTourStepEnter } from "../utils/tourNavigation";
import {
  computeTourCardPlacement,
  TOUR_CARD_MARGIN,
} from "../utils/tourPlacement";
import {
  collapsedHole,
  computeBlockerRects,
  computeSpotlightHole,
} from "../utils/tourSpotlight";

import { TourCard } from "./TourCard";
import { TourScrim } from "./TourScrim";

const CARD_MAX_WIDTH = 360;
/** Height used for the very first placement, before the card reports its real size. */
const CARD_HEIGHT_ESTIMATE = 220;
/** When the user opens the + menu themselves, let it finish springing open before moving on. */
const ADVANCE_ON_TARGET_DELAY_MS = 220;
/** How dim the scrim dips while the spotlight cross-fades to the next target (reduced motion). */
const CROSSFADE_DIP = 0.45;

/** A celebration burst from the middle of a target (the + button once the menu opens). */
function burstAtTarget(targetId: string): void {
  void measureTourTarget(targetId).then((rect) => {
    if (!rect) {
      return;
    }
    useCelebrationStore.getState().celebrate({
      kind: "burst",
      at: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
      // The step change gives the same tick right away.
      haptic: false,
    });
  });
}

/** Side effects of the current step: app state, feedback, and waiting for the user to act. */
function useTourStepEffects(stepIndex: number): void {
  const step = TOUR_STEPS[stepIndex];

  // Put the app where the step expects it (tab, add menu).
  useEffect(() => {
    runTourStepEnter(step);
  }, [step]);

  // A light tick for each step (the finish card gets its confirm haptic when it appears).
  useEffect(() => {
    if (step.kind !== "finale") {
      void triggerTickHaptic();
    }
  }, [step]);

  // Keep the add menu open while a step points at it (its idle timer would close it).
  const holdFab = step.holdFab === true;
  useEffect(() => {
    if (!holdFab) {
      return;
    }
    useAddTransactionFabStore.getState().setHoldOpen(true);
    return () => useAddTransactionFabStore.getState().setHoldOpen(false);
  }, [holdFab]);

  // Steps that wait for the user to do the thing themselves. (`transactionSaved` is raised by the
  // manual add screen, where this overlay is not mounted: see `useAppTourStore.onTransactionSaved`.)
  const advanceOn = step.advanceOn;
  const targetId = step.targetId;
  useEffect(() => {
    if (advanceOn !== "fabOpened") {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useAddTransactionFabStore.subscribe((state, prev) => {
      if (state.fabOpen && !prev.fabOpen) {
        timer = setTimeout(() => {
          if (targetId) {
            burstAtTarget(targetId);
          }
          useAppTourStore.getState().next();
        }, ADVANCE_ON_TARGET_DELAY_MS);
      }
    });
    return () => {
      unsubscribe();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [advanceOn, targetId]);

  // Leave the add menu closed when the tour goes away.
  useEffect(
    () => () => useAddTransactionFabStore.getState().setFabOpen(false),
    [],
  );
}

function TourStage() {
  const stepIndex = useAppTourStore((s) => s.stepIndex);
  const retry = useAppTourStore((s) => s.retry);
  const startedFrom = useAppTourStore((s) => s.startedFrom);
  const next = useAppTourStore((s) => s.next);
  const back = useAppTourStore((s) => s.back);
  const skip = useAppTourStore((s) => s.skip);
  const finish = useAppTourStore((s) => s.finish);
  const step = TOUR_STEPS[stepIndex];

  const insets = useSafeAreaInsets();
  const windowSize = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const motion = getTourMotion(reduceMotion);

  const rootRef = useRef<View>(null);
  const titleRef = useRef<Text>(null);
  const [size, setSize] = useState({
    width: windowSize.width,
    height: windowSize.height,
  });
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [cardHeight, setCardHeight] = useState(CARD_HEIGHT_ESTIMATE);
  const [nudgeCount, setNudgeCount] = useState(0);
  // What the card shows lags the current step: it fades out, swaps its content while invisible,
  // and fades back in once the spotlight has settled on the new target.
  const [contentIndex, setContentIndex] = useState(stepIndex);
  const [revealedFor, setRevealedFor] = useState<number | null>(null);

  useTourStepEffects(stepIndex);

  // Hardware back: from the first and recap steps it leaves the tour; elsewhere it steps back.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        const { stepIndex: current } = useAppTourStore.getState();
        const id = TOUR_STEPS[current].id;
        if (id === "finale") {
          finish();
        } else if (id === "welcome" || id === "homeRecent") {
          skip();
        } else {
          back();
        }
        return true;
      },
    );
    return () => subscription.remove();
  }, [back, finish, skip]);

  const onRootLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
    // Target rects are in window coordinates; learn where this overlay sits in the window.
    rootRef.current?.measureInWindow((x, y) => setOrigin({ x, y }));
  }, []);

  // ── Target and spotlight hole ───────────────────────────────────────────────
  const { rect: windowRect, status } = useTourTargetRect(
    step.targetId,
    step.id,
    true,
  );
  const hole = windowRect
    ? computeSpotlightHole(
        {
          x: windowRect.x - origin.x,
          y: windowRect.y - origin.y,
          width: windowRect.width,
          height: windowRect.height,
        },
        {
          padding: step.padding,
          shape: step.shape,
          radius: step.radius,
          screen: size,
        },
      )
    : null;
  const resting = hole ?? collapsedHole({ x: size.width / 2, y: size.height / 2 });

  const holeX = useSharedValue(resting.x);
  const holeY = useSharedValue(resting.y);
  const holeWidth = useSharedValue(resting.width);
  const holeHeight = useSharedValue(resting.height);
  const holeRadius = useSharedValue(resting.radius);
  const enter = useSharedValue(0);
  const pulse = useSharedValue(0);
  const trailFromX = useSharedValue(0);
  const trailFromY = useSharedValue(0);
  const trailToX = useSharedValue(0);
  const trailToY = useSharedValue(0);
  const trailClock = useSharedValue(Number.MAX_SAFE_INTEGER);
  const movedForStepRef = useRef<number | null>(null);

  useEffect(() => {
    enter.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) });
  }, [enter]);

  useEffect(() => {
    if (!motion.pulse) {
      pulse.value = 0.4;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [motion.pulse, pulse]);

  useEffect(() => {
    // While the next target is being located the hole stays on the previous one, so it glides
    // straight from target to target instead of closing in between.
    if (status === "resolving") {
      return;
    }
    // After a step change the card fades out first; the hole waits for that.
    const stepChanged =
      movedForStepRef.current !== null && movedForStepRef.current !== stepIndex;
    movedForStepRef.current = stepIndex;
    const delay = stepChanged ? motion.cardOutMs : 0;

    const hadHole = holeWidth.value > 0.5 && holeHeight.value > 0.5;
    const fromX = holeX.value + holeWidth.value / 2;
    const fromY = holeY.value + holeHeight.value / 2;
    const toX = resting.x + resting.width / 2;
    const toY = resting.y + resting.height / 2;

    if (motion.spring) {
      holeX.value = withDelay(delay, withSpring(resting.x, springs.tourSpotlight));
      holeY.value = withDelay(delay, withSpring(resting.y, springs.tourSpotlight));
      holeWidth.value = withDelay(
        delay,
        withSpring(resting.width, springs.tourSpotlight),
      );
      holeHeight.value = withDelay(
        delay,
        withSpring(resting.height, springs.tourSpotlight),
      );
      holeRadius.value = withDelay(
        delay,
        withSpring(resting.radius, springs.tourSpotlight),
      );

      // Sparkles along the way, only for a real trip between two targets.
      const distance = Math.hypot(toX - fromX, toY - fromY);
      if (
        motion.sparkle &&
        stepChanged &&
        hadHole &&
        resting.width > 0.5 &&
        distance > TOUR_SPARKLE_TRAIL.minDistance
      ) {
        trailFromX.value = fromX;
        trailFromY.value = fromY;
        trailToX.value = toX;
        trailToY.value = toY;
        trailClock.value = 0;
        trailClock.value = withDelay(
          delay,
          withTiming(TOUR_SPARKLE_TRAIL.travelMs + TOUR_SPARKLE_TRAIL.fadeMs, {
            duration: TOUR_SPARKLE_TRAIL.travelMs + TOUR_SPARKLE_TRAIL.fadeMs,
            easing: Easing.linear,
          }),
        );
      }
    } else if (stepChanged) {
      // Reduced motion: no travel. The dim layer dips and the hole is there when it returns.
      const half = Math.round(motion.fadeMs / 2);
      enter.value = withSequence(
        withTiming(CROSSFADE_DIP, { duration: half }),
        withTiming(1, { duration: half }),
      );
      const jump = (to: number) => withDelay(half, withTiming(to, { duration: 0 }));
      holeX.value = jump(resting.x);
      holeY.value = jump(resting.y);
      holeWidth.value = jump(resting.width);
      holeHeight.value = jump(resting.height);
      holeRadius.value = jump(resting.radius);
    } else {
      holeX.value = resting.x;
      holeY.value = resting.y;
      holeWidth.value = resting.width;
      holeHeight.value = resting.height;
      holeRadius.value = resting.radius;
    }
  }, [
    status,
    stepIndex,
    motion.spring,
    motion.sparkle,
    motion.cardOutMs,
    motion.fadeMs,
    resting.x,
    resting.y,
    resting.width,
    resting.height,
    resting.radius,
    holeX,
    holeY,
    holeWidth,
    holeHeight,
    holeRadius,
    enter,
    trailFromX,
    trailFromY,
    trailToX,
    trailToY,
    trailClock,
  ]);

  // ── Card choreography ───────────────────────────────────────────────────────
  // 1. The step changes: the card is already fading out (`visible` goes false); once it is gone
  //    its content swaps to the new step.
  useEffect(() => {
    if (contentIndex === stepIndex) {
      return;
    }
    const timer = setTimeout(() => setContentIndex(stepIndex), motion.cardOutMs);
    return () => clearTimeout(timer);
  }, [stepIndex, contentIndex, motion.cardOutMs]);

  // 2. The new target is found and the hole has landed on it: the card appears.
  useEffect(() => {
    if (
      revealedFor === stepIndex ||
      contentIndex !== stepIndex ||
      status === "resolving"
    ) {
      return;
    }
    const wait = motion.holeSettleMs + (revealedFor !== null ? motion.cardOutMs : 0);
    const timer = setTimeout(() => setRevealedFor(stepIndex), wait);
    return () => clearTimeout(timer);
  }, [
    stepIndex,
    contentIndex,
    revealedFor,
    status,
    motion.holeSettleMs,
    motion.cardOutMs,
  ]);

  const cardVisible = revealedFor === stepIndex && contentIndex === stepIndex;
  const contentStep = TOUR_STEPS[contentIndex];
  const contentBody =
    retry && contentStep.retryBody ? contentStep.retryBody : contentStep.body;
  const actionNumber = getTourActionStepNumber(contentIndex);

  const cardWidth = Math.min(size.width - TOUR_CARD_MARGIN * 2, CARD_MAX_WIDTH);
  const placement = computeTourCardPlacement({
    target: hole,
    card: { width: cardWidth, height: cardHeight },
    screen: size,
    insets,
    preferred: step.placement,
  });
  const onMeasured = useCallback((height: number) => setCardHeight(height), []);

  // Screen readers: say where we are and move focus to the card each time it appears.
  useEffect(() => {
    if (!cardVisible) {
      return;
    }
    const position =
      actionNumber === null
        ? ""
        : `Step ${actionNumber} of ${TOUR_ACTION_STEP_COUNT}. `;
    AccessibilityInfo.announceForAccessibility(
      `${position}${contentStep.title}. ${contentBody}`,
    );
    let cancelled = false;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      const tag = findNodeHandle(titleRef.current);
      if (enabled && !cancelled && tag) {
        AccessibilityInfo.setAccessibilityFocus(tag);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cardVisible, actionNumber, contentStep.title, contentBody]);

  // The finish card confirms with a haptic as its check draws (not on a replay).
  const isFinaleVisible = cardVisible && contentStep.kind === "finale";
  useEffect(() => {
    if (isFinaleVisible && startedFrom !== "replay") {
      void triggerConfirmHaptic();
    }
  }, [isFinaleVisible, startedFrom]);

  const onNudge = useCallback(() => {
    void triggerHaptic();
    setNudgeCount((count) => count + 1);
  }, []);

  const onAction = useCallback(() => {
    const action = TOUR_STEPS[useAppTourStore.getState().stepIndex].action;
    if (action) {
      runTourCardAction(action);
    }
  }, []);

  // ── Touch blocking ──────────────────────────────────────────────────────────
  // The real element stays tappable only on "tap it yourself" steps; everywhere else the whole
  // screen is absorbed so a stray tap cannot leave the tour behind.
  const blockers =
    step.interaction === "tapTarget" && hole
      ? computeBlockerRects(hole, size)
      : [{ x: 0, y: 0, width: size.width, height: size.height }];

  return (
    <View
      ref={rootRef}
      collapsable={false}
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={onRootLayout}
    >
      <TourScrim
        width={size.width}
        height={size.height}
        holeX={holeX}
        holeY={holeY}
        holeWidth={holeWidth}
        holeHeight={holeHeight}
        holeRadius={holeRadius}
        enter={enter}
        pulse={pulse}
        trail={
          motion.sparkle
            ? {
                fromX: trailFromX,
                fromY: trailFromY,
                toX: trailToX,
                toY: trailToY,
                clock: trailClock,
              }
            : undefined
        }
      />

      {/* Absorbs stray taps; hidden from screen readers (the card carries the content). */}
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {blockers.map((rect, index) => (
          <Pressable
            key={index}
            accessible={false}
            onPress={onNudge}
            style={{
              position: "absolute",
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
            }}
          />
        ))}
      </View>

      <TourCard
        step={contentStep}
        body={contentBody}
        actionNumber={actionNumber}
        actionTotal={TOUR_ACTION_STEP_COUNT}
        width={cardWidth}
        placement={placement}
        visible={cardVisible}
        motion={motion}
        nudgeCount={nudgeCount}
        titleRef={titleRef}
        onMeasured={onMeasured}
        onNext={next}
        onAction={onAction}
        onSkip={skip}
      />
    </View>
  );
}

/**
 * Hides the tour (keeping its place in the store) while the user is elsewhere: a modal flow is
 * open, or a pushed screen (the manual add form the tour sends them to, settings...) covers the
 * tabs. The stage mounts again, at the stored step, when they come back to the tabs.
 */
function TourSession() {
  const paused = useTourPaused();
  return paused ? null : <TourStage />;
}

/**
 * The guided app tour. Mounted once at the app root (above the navigator, so spotlight
 * coordinates match the window); renders nothing until the tour is started.
 */
export function AppTourOverlay() {
  const active = useAppTourStore((s) => s.active);
  return active ? <TourSession /> : null;
}
