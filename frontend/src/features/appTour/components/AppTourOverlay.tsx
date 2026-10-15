import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  BackHandler,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import {
  Easing,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { springs } from "@/constants/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";

import { TOUR_STEPS } from "../constants/tourSteps";
import { useTourPaused } from "../hooks/useTourPaused";
import { useTourTargetRect } from "../hooks/useTourTargetRect";
import { useAppTourStore } from "../store/appTourStore";
import {
  openManualAddFromTour,
  runTourStepEnter,
} from "../utils/tourNavigation";
import { getTourMotion } from "../utils/tourMotion";
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
import { TourConfetti } from "./TourConfetti";
import { TourScrim } from "./TourScrim";

const CARD_MAX_WIDTH = 360;
/** Height used for the very first placement, before the card reports its real size. */
const CARD_HEIGHT_ESTIMATE = 220;
/** When the user opens the + menu themselves, let it finish springing open before moving on. */
const ADVANCE_ON_TARGET_DELAY_MS = 220;

/** Side effects of the current step: app state, feedback, and waiting for the user to act. */
function useTourStepEffects(stepIndex: number): void {
  const step = TOUR_STEPS[stepIndex];

  // Put the app where the step expects it (tab, add menu, scroll position).
  useEffect(() => {
    runTourStepEnter(step);
  }, [step]);

  // Haptic tick and a spoken heads-up for each step.
  useEffect(() => {
    void triggerHaptic();
    AccessibilityInfo.announceForAccessibility(`${step.title}. ${step.body}`);
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

  // Steps that wait for the user to do the thing themselves.
  const advanceOn = step.advanceOn;
  useEffect(() => {
    if (advanceOn !== "fabOpened") {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useAddTransactionFabStore.subscribe((state, prev) => {
      if (state.fabOpen && !prev.fabOpen) {
        timer = setTimeout(
          () => useAppTourStore.getState().next(),
          ADVANCE_ON_TARGET_DELAY_MS,
        );
      }
    });
    return () => {
      unsubscribe();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [advanceOn]);

  // Leave the add menu closed when the tour goes away.
  useEffect(
    () => () => useAddTransactionFabStore.getState().setFabOpen(false),
    [],
  );
}

function TourStage() {
  const stepIndex = useAppTourStore((s) => s.stepIndex);
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
  const [size, setSize] = useState({
    width: windowSize.width,
    height: windowSize.height,
  });
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [cardHeight, setCardHeight] = useState(CARD_HEIGHT_ESTIMATE);
  const [nudgeCount, setNudgeCount] = useState(0);

  useTourStepEffects(stepIndex);

  // Hardware back steps the tour back (or skips it from the first step).
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (useAppTourStore.getState().stepIndex === 0) {
          skip();
        } else {
          back();
        }
        return true;
      },
    );
    return () => subscription.remove();
  }, [back, skip]);

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
    if (motion.spring) {
      holeX.value = withSpring(resting.x, springs.tourSpotlight);
      holeY.value = withSpring(resting.y, springs.tourSpotlight);
      holeWidth.value = withSpring(resting.width, springs.tourSpotlight);
      holeHeight.value = withSpring(resting.height, springs.tourSpotlight);
      holeRadius.value = withSpring(resting.radius, springs.tourSpotlight);
    } else {
      holeX.value = resting.x;
      holeY.value = resting.y;
      holeWidth.value = resting.width;
      holeHeight.value = resting.height;
      holeRadius.value = resting.radius;
    }
  }, [
    status,
    motion.spring,
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
  ]);

  // ── Card ────────────────────────────────────────────────────────────────────
  const cardWidth = Math.min(size.width - TOUR_CARD_MARGIN * 2, CARD_MAX_WIDTH);
  const placement = computeTourCardPlacement({
    target: hole,
    card: { width: cardWidth, height: cardHeight },
    screen: size,
    insets,
    preferred: step.placement,
  });
  const onMeasured = useCallback((height: number) => setCardHeight(height), []);

  const onNudge = useCallback(() => {
    void triggerHaptic();
    setNudgeCount((count) => count + 1);
  }, []);

  const onFinaleAction = useCallback(() => {
    finish();
    openManualAddFromTour();
  }, [finish]);

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
      />

      {blockers.map((rect, index) => (
        <Pressable
          key={index}
          accessible={false}
          importantForAccessibility="no"
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

      {step.kind === "finale" && motion.confetti ? (
        <TourConfetti
          width={size.width}
          height={size.height}
          originX={size.width / 2}
          originY={placement.top + 56}
        />
      ) : null}

      <TourCard
        step={step}
        index={stepIndex}
        total={TOUR_STEPS.length}
        width={cardWidth}
        placement={placement}
        settled={status !== "resolving"}
        motion={motion}
        nudgeCount={nudgeCount}
        onMeasured={onMeasured}
        onNext={next}
        onBack={back}
        onSkip={skip}
        onFinaleAction={onFinaleAction}
      />
    </View>
  );
}

/** Hides the tour (keeping its place) while the user is elsewhere; shows the stage otherwise. */
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
