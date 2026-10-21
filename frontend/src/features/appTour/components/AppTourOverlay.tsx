import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  BackHandler,
  findNodeHandle,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import {
  cancelAnimation,
  Easing,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing } from "@/constants";
import { springs } from "@/constants/motion";
import {
  isSampleDataOnScreen,
  setTourPreviewSuspended,
  useTourPreviewStore,
} from "@/features/tourPreview";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { getCelebrationsEnabled } from "@/lib/haptics/hapticPreferencesStorage";
import {
  triggerConfirmHaptic,
  triggerHaptic,
  triggerTickHaptic,
} from "@/lib/haptics/nativeHaptics";
import { emitTourEvent, tourEventNames } from "@/lib/tour/tourEvents";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";
import { useCelebrationStore } from "@/stores/celebrationStore";

import {
  getStepScreen,
  getTour,
  getTourActionStepCount,
  getTourActionStepNumber,
} from "../constants/tourRegistry";
import type { TourId } from "../constants/tourTypes";
import {
  useCurrentRouteName,
  useTourPaused,
} from "../hooks/useTourPaused";
import { useTourScrimValues, TOUR_RING_IDLE, type TourScrimValues } from "../hooks/useTourScrimValues";
import { useTourTargetRect } from "../hooks/useTourTargetRect";
import { useAppTourStore } from "../store/appTourStore";
import { launchTour } from "../utils/launchTour";
import {
  getTourMotion,
  TOUR_RIPPLE,
  TOUR_SPARKLE_TRAIL,
} from "../utils/tourMotion";
import {
  isTabScreen,
  isTourTabName,
  runTourCardAction,
  runTourStepEnter,
} from "../utils/tourNavigation";
import {
  computeTourCardPlacement,
  TOUR_CARD_MARGIN,
} from "../utils/tourPlacement";
import {
  collapsedHole,
  computeBlockerRects,
  computeSpotlightHole,
} from "../utils/tourSpotlight";

import { DimeAgentIcon } from "./tourIcon";
import { TourCard } from "./TourCard";
import { TourNiceBadge } from "./TourNiceBadge";
import { TourSamplePill } from "./TourSamplePill";
import { TourScrim } from "./TourScrim";

const CARD_MAX_WIDTH = 360;
/** Height used for the very first placement, before the card reports its real size. */
const CARD_HEIGHT_ESTIMATE = 220;
/** How dim the scrim dips while the spotlight cross-fades to the next target (reduced motion). */
const CROSSFADE_DIP = 0.45;
/** A step on a pushed screen that never gets that screen is skipped after this long (ms). */
const SCREEN_WAIT_MS = 1600;
/** The "Sample data" pill sits just under the status bar; the card keeps clear of it. */
const SAMPLE_PILL_GAP = spacing.xs;
const SAMPLE_PILL_ROOM = 36;
/** Height of the native stack header (below the status bar) on pushed screens with a title. */
const STACK_HEADER_HEIGHT = 56;
/** How long a card with no target waits before it appears (it only needs the old card to have faded). */
const NO_TARGET_SETTLE_MS = 40;

/** Side effects of the current step: app state, feedback, and waiting for the user to act. */
function useTourStepEffects(tourId: TourId, stepIndex: number): void {
  const step = getTour(tourId).steps[stepIndex];

  // Put the app where the step expects it (tab, add menu, agent).
  useEffect(() => {
    runTourStepEnter(tourId, step);
  }, [tourId, step]);

  // A light tick for each step (a finish card gets its own confirm haptic when it appears).
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

  // The + menu opening is the one thing no screen reports: watch it for the steps that wait on it.
  // (`transactionSaved` is raised by the manual add screen, where this overlay is not mounted:
  // see `useAppTourStore.onTransactionSaved`. Everything else comes from `emitTourEvent` calls
  // in the screens' own handlers.)
  const advanceOn = step.advanceOn;
  useEffect(() => {
    if (advanceOn !== tourEventNames.fabOpened) {
      return;
    }
    return useAddTransactionFabStore.subscribe((state, prev) => {
      if (state.fabOpen && !prev.fabOpen) {
        emitTourEvent(tourEventNames.fabOpened);
      }
    });
  }, [advanceOn]);

  // Leave the add menu closed when the tour goes away.
  useEffect(
    () => () => useAddTransactionFabStore.getState().setFabOpen(false),
    [],
  );
}

function TourStage({ scrim }: { scrim: TourScrimValues }) {
  const tourId = useAppTourStore((s) => s.tourId);
  const stepIndex = useAppTourStore((s) => s.stepIndex);
  const retry = useAppTourStore((s) => s.retry);
  const startedFrom = useAppTourStore((s) => s.startedFrom);
  const completion = useAppTourStore((s) => s.completion);
  const doneCount = useAppTourStore((s) => s.doneCount);
  const celebrated = useAppTourStore((s) => s.celebrated);
  const markCelebrated = useAppTourStore((s) => s.markCelebrated);
  const next = useAppTourStore((s) => s.next);
  const back = useAppTourStore((s) => s.back);
  const skip = useAppTourStore((s) => s.skip);
  const finish = useAppTourStore((s) => s.finish);
  const skipUnavailable = useAppTourStore((s) => s.skipUnavailable);
  const tour = getTour(tourId);
  const step = tour.steps[stepIndex];
  const stepKey = `${tourId}:${stepIndex}`;

  const insets = useSafeAreaInsets();
  const windowSize = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const motion = getTourMotion(reduceMotion);
  const { userId } = useSessionUserId();

  const rootRef = useRef<View>(null);
  const titleRef = useRef<View>(null);
  const [size, setSize] = useState({
    width: windowSize.width,
    height: windowSize.height,
  });
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const originRef = useRef(origin);
  const [cardHeight, setCardHeight] = useState(CARD_HEIGHT_ESTIMATE);
  const [nudgeCount, setNudgeCount] = useState(0);
  // What the card shows lags the current step: it fades out, swaps its content while invisible,
  // and fades back in once the spotlight has settled on the new target.
  const [contentIndex, setContentIndex] = useState(stepIndex);
  const [revealedFor, setRevealedFor] = useState<number | null>(null);
  // "Nice!" over the target the user just used (overlay coordinates).
  const [nice, setNice] = useState<{ x: number; y: number; key: number } | null>(null);

  useTourStepEffects(tourId, stepIndex);

  // Hardware back: from a step marked `backExits` (the first, and the first-run tour's recap) it
  // leaves the tour; from the finish card it closes it; elsewhere it steps back.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        const { tourId: activeId, stepIndex: current } = useAppTourStore.getState();
        const activeStep = getTour(activeId).steps[current];
        if (activeStep.kind === "finale") {
          finish();
        } else if (activeStep.backExits === true || current === 0) {
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
    rootRef.current?.measureInWindow((x, y) => {
      originRef.current = { x, y };
      setOrigin({ x, y });
    });
  }, []);

  // ── Target and spotlight hole ───────────────────────────────────────────────
  // A step with `scrollKey` scrolls its screen until the target is in view before the hole lands.
  const reveal =
    step.targetId && step.scrollKey
      ? {
          scrollKey: step.scrollKey,
          anchorId: step.revealVia,
          windowHeight: windowSize.height,
          bottomReserved: spacing.tabBarHeight + Math.max(insets.bottom, spacing.sm),
          fallbackTop: insets.top + 64,
        }
      : undefined;
  const { rect: windowRect, status } = useTourTargetRect(
    step.targetId,
    stepKey,
    true,
    reveal,
    step.optional === true,
  );

  // A step whose target never shows up is skipped when it is optional (an empty day has no
  // payment to open); otherwise the card is simply centered.
  useEffect(() => {
    if (step.optional === true && status === "missing") {
      skipUnavailable();
    }
  }, [step.optional, status, skipUnavailable]);

  // A step on a pushed screen (a transaction's details) waits for that screen; if the user's tap
  // never got there, it is skipped rather than left hanging.
  const routeName = useCurrentRouteName();
  const stepScreen = getStepScreen(tourId, step);
  const waitingForScreen =
    stepScreen !== undefined && !isTabScreen(stepScreen) && routeName !== stepScreen;
  useEffect(() => {
    if (!waitingForScreen) {
      return;
    }
    const timer = setTimeout(skipUnavailable, SCREEN_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waitingForScreen, stepIndex, skipUnavailable]);

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
  const {
    x: restingX,
    y: restingY,
    width: restingWidth,
    height: restingHeight,
    radius: restingRadius,
  } = resting;

  // The values the run's one canvas draws from (owned by the session; the stage only writes them).
  const {
    holeX,
    holeY,
    holeWidth,
    holeHeight,
    holeRadius,
    enter,
    pulse,
    emphasis,
    trailFromX,
    trailFromY,
    trailToX,
    trailToY,
    trailClock,
    rippleX,
    rippleY,
    rippleClock,
    warpX,
    warpY,
    warpClock,
  } = scrim;
  const movedForStepRef = useRef<number | null>(null);
  // Where the hole last was (JS-side mirror: shared values are only ever written from here).
  const restingRef = useRef(resting);
  const niceUntilRef = useRef(0);

  useEffect(() => {
    // The dim layer fades in with the stage (the canvas itself stays up for the whole run).
    enter.value = 0;
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
    return () => cancelAnimation(pulse);
  }, [motion.pulse, pulse]);

  // A "Do" step glows fully; a "Watch" step only softly.
  const isDoStep = step.kind === "do";
  useEffect(() => {
    emphasis.value = withTiming(isDoStep ? 1 : 0.4, { duration: 260 });
  }, [isDoStep, emphasis]);

  useEffect(() => {
    // While the next target is being located the hole stays on the previous one, so it glides
    // straight from target to target instead of closing in between.
    if (status === "resolving") {
      return;
    }
    // An optional step whose target is absent is about to be skipped: the hole stays where it was
    // instead of swinging to the middle of the screen first.
    if (status === "missing" && step.optional === true) {
      return;
    }
    // After a step change the card fades out first; the hole waits for that.
    const previousIndex = movedForStepRef.current;
    const stepChanged = previousIndex !== null && previousIndex !== stepIndex;
    movedForStepRef.current = stepIndex;
    const delay = stepChanged ? motion.cardOutMs : 0;

    const target = {
      x: restingX,
      y: restingY,
      width: restingWidth,
      height: restingHeight,
      radius: restingRadius,
    };
    const previous = restingRef.current;
    const hadHole = previous.width > 0.5 && previous.height > 0.5;
    const fromX = previous.x + previous.width / 2;
    const fromY = previous.y + previous.height / 2;
    const toX = target.x + target.width / 2;
    const toY = target.y + target.height / 2;
    restingRef.current = target;

    // Moving to another screen: a wide ring zooms out from where the hole was.
    const previousStep = previousIndex === null ? undefined : tour.steps[previousIndex];
    const screenChanged =
      previousStep !== undefined &&
      getStepScreen(tourId, previousStep) !== getStepScreen(tourId, step);
    if (motion.ripple && stepChanged && screenChanged && hadHole) {
      warpX.value = fromX;
      warpY.value = fromY;
      warpClock.value = TOUR_RING_IDLE;
      warpClock.value = withDelay(
        delay,
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(TOUR_RIPPLE.warpMs, {
            duration: TOUR_RIPPLE.warpMs,
            easing: Easing.linear,
          }),
        ),
      );
    }

    if (motion.spring) {
      holeX.value = withDelay(delay, withSpring(target.x, springs.tourSpotlight));
      holeY.value = withDelay(delay, withSpring(target.y, springs.tourSpotlight));
      holeWidth.value = withDelay(
        delay,
        withSpring(target.width, springs.tourSpotlight),
      );
      holeHeight.value = withDelay(
        delay,
        withSpring(target.height, springs.tourSpotlight),
      );
      holeRadius.value = withDelay(
        delay,
        withSpring(target.radius, springs.tourSpotlight),
      );

      // Sparkles along the way, only for a real trip between two targets.
      const distance = Math.hypot(toX - fromX, toY - fromY);
      if (
        motion.sparkle &&
        stepChanged &&
        hadHole &&
        target.width > 0.5 &&
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
      holeX.value = jump(target.x);
      holeY.value = jump(target.y);
      holeWidth.value = jump(target.width);
      holeHeight.value = jump(target.height);
      holeRadius.value = jump(target.radius);
    } else {
      holeX.value = target.x;
      holeY.value = target.y;
      holeWidth.value = target.width;
      holeHeight.value = target.height;
      holeRadius.value = target.radius;
    }
  }, [
    status,
    stepIndex,
    tour,
    tourId,
    step,
    motion.spring,
    motion.sparkle,
    motion.ripple,
    motion.cardOutMs,
    motion.fadeMs,
    restingX,
    restingY,
    restingWidth,
    restingHeight,
    restingRadius,
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
    warpX,
    warpY,
    warpClock,
  ]);

  // ── A "Do" step succeeded ───────────────────────────────────────────────────
  // The user really did the thing: coins at the target, a ripple, and "Nice!" while the tour gets
  // the next step ready. (The tick haptic comes with the step change.)
  const seenDoneRef = useRef(doneCount);
  useEffect(() => {
    if (doneCount === seenDoneRef.current) {
      return;
    }
    seenDoneRef.current = doneCount;
    const previous = restingRef.current;
    if (previous.width <= 0.5) {
      return;
    }
    const centerX = previous.x + previous.width / 2;
    const centerY = previous.y + previous.height / 2;
    niceUntilRef.current = Date.now() + motion.niceHoldMs;
    setNice({ x: centerX, y: centerY, key: doneCount });
    useCelebrationStore.getState().celebrate({
      kind: "burst",
      at: { x: centerX + originRef.current.x, y: centerY + originRef.current.y },
      // The step change gives the same tick right away.
      haptic: false,
    });
    if (motion.ripple) {
      rippleX.value = centerX;
      rippleY.value = centerY;
      rippleClock.value = TOUR_RING_IDLE;
      rippleClock.value = withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(TOUR_RIPPLE.doneMs, {
          duration: TOUR_RIPPLE.doneMs,
          easing: Easing.linear,
        }),
      );
    }
    const timer = setTimeout(() => setNice(null), motion.niceHoldMs + 250);
    return () => clearTimeout(timer);
  }, [doneCount, motion.niceHoldMs, motion.ripple, rippleX, rippleY, rippleClock]);

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

  // 2. The new target is found and the hole has landed on it (and "Nice!" has had its moment):
  //    the card appears.
  useEffect(() => {
    if (
      revealedFor === stepIndex ||
      contentIndex !== stepIndex ||
      status === "resolving"
    ) {
      return;
    }
    // A card with no target (the welcome and finish cards) has no hole to wait for.
    const settle = step.targetId === undefined ? NO_TARGET_SETTLE_MS : motion.holeSettleMs;
    const wait = settle + (revealedFor !== null ? motion.cardOutMs : 0);
    const holdLeft = Math.max(0, niceUntilRef.current - Date.now());
    const timer = setTimeout(() => setRevealedFor(stepIndex), Math.max(wait, holdLeft));
    return () => clearTimeout(timer);
  }, [
    stepIndex,
    contentIndex,
    revealedFor,
    status,
    motion.holeSettleMs,
    motion.cardOutMs,
    step.targetId,
  ]);

  const cardVisible = revealedFor === stepIndex && contentIndex === stepIndex;
  const contentStep = tour.steps[contentIndex];
  const contentBody =
    retry && contentStep.retryBody ? contentStep.retryBody : contentStep.body;
  const actionNumber = getTourActionStepNumber(tourId, contentIndex);
  const actionTotal = getTourActionStepCount(tourId);

  // The "Sample data" pill: sample numbers are on screen (or the Ask AI chat is a scripted one).
  const sampleOnScreen = useTourPreviewStore((s) => isSampleDataOnScreen(s, userId));
  const scriptedFrom = tour.steps.findIndex((s) => s.advanceOn === "suggestionTapped") + 1;
  const scriptedChatOnScreen =
    tour.scriptedChat === true &&
    scriptedFrom > 0 &&
    stepIndex >= scriptedFrom &&
    step.kind !== "finale";
  const samplePillVisible = sampleOnScreen || scriptedChatOnScreen;
  // On a pushed screen the pill sits under the native header, so it never covers its title (the
  // transaction details card has no header).
  const hasStackHeader =
    routeName !== undefined &&
    !isTourTabName(routeName) &&
    routeName !== "TransactionDetail";
  const contentTop = insets.top + (hasStackHeader ? STACK_HEADER_HEIGHT : 0);
  const samplePillTop = contentTop + SAMPLE_PILL_GAP;

  const cardWidth = Math.min(size.width - TOUR_CARD_MARGIN * 2, CARD_MAX_WIDTH);
  const placement = computeTourCardPlacement({
    target: hole,
    card: { width: cardWidth, height: cardHeight },
    screen: size,
    insets: {
      ...insets,
      top: samplePillVisible ? samplePillTop + SAMPLE_PILL_ROOM - SAMPLE_PILL_GAP : insets.top,
    },
    preferred: step.placement,
  });
  const onMeasured = useCallback((height: number) => setCardHeight(height), []);

  // Screen readers: say where we are and move focus to the card each time it appears.
  const doneText =
    completion && contentStep.kind === "finale"
      ? ` ${completion.seenCount} of ${completion.total} tours done.`
      : "";
  useEffect(() => {
    if (!cardVisible) {
      return;
    }
    const position =
      actionNumber === null ? "" : `Step ${actionNumber} of ${actionTotal}. `;
    AccessibilityInfo.announceForAccessibility(
      `${position}${contentStep.title}. ${contentBody}${doneText}`,
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
  }, [cardVisible, actionNumber, actionTotal, contentStep.title, contentBody, doneText]);

  // The finish card celebrates as it appears. First-run tour: a confirm haptic (not on a replay).
  // Tab tours: the confetti their run earned (never the big one twice in a day, never on a
  // replay), or just a confirm haptic with the check when motion or celebrations are off.
  const isFinaleVisible = cardVisible && contentStep.kind === "finale";
  useEffect(() => {
    // Once per run: a pause and resume remounts this stage and must not celebrate again.
    if (!isFinaleVisible || celebrated) {
      return;
    }
    markCelebrated();
    if (tourId === "firstExpense") {
      if (startedFrom !== "replay") {
        void triggerConfirmHaptic();
      }
      return;
    }
    if (!completion) {
      return;
    }
    if (reduceMotion || !getCelebrationsEnabled()) {
      void triggerConfirmHaptic();
      return;
    }
    const celebrations = useCelebrationStore.getState();
    if (completion.celebration === "grand") {
      celebrations.celebrate({ kind: "confetti", ignoreDailyCap: true });
    } else if (completion.celebration === "full") {
      celebrations.celebrate({ kind: "confetti", capFallback: "medium" });
    } else {
      celebrations.celebrate({ kind: "confettiMedium" });
    }
  }, [isFinaleVisible, celebrated, markCelebrated, tourId, startedFrom, completion, reduceMotion]);

  const onNudge = useCallback(() => {
    void triggerHaptic();
    setNudgeCount((count) => count + 1);
  }, []);

  const onAction = useCallback(() => {
    const { tourId: activeId, stepIndex: current } = useAppTourStore.getState();
    const action = getTour(activeId).steps[current].action;
    if (action) {
      runTourCardAction(action);
    }
  }, []);

  // "Up next": this tour is done, so end it and start the next one.
  const onStartNext = useCallback((id: TourId) => {
    useAppTourStore.getState().finish();
    launchTour(id);
  }, []);

  // ── Touch blocking ──────────────────────────────────────────────────────────
  // The real element stays tappable only on "Do" steps; everywhere else the whole screen is
  // absorbed so a stray tap cannot leave the tour behind.
  const blockers =
    step.kind === "do" && hole
      ? computeBlockerRects(hole, size)
      : [{ x: 0, y: 0, width: size.width, height: size.height }];

  const showBack =
    tourId !== "firstExpense" &&
    contentIndex > 0 &&
    contentStep.backExits !== true &&
    contentStep.kind !== "finale";

  return (
    <View
      ref={rootRef}
      collapsable={false}
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={onRootLayout}
    >
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

      {samplePillVisible ? (
        <TourSamplePill
          label={scriptedChatOnScreen ? "Sample chat" : "Sample data"}
          icon={scriptedChatOnScreen ? DimeAgentIcon : undefined}
          top={samplePillTop}
          motion={motion}
        />
      ) : null}

      {nice ? <TourNiceBadge key={nice.key} x={nice.x} y={nice.y} motion={motion} /> : null}

      <TourCard
        tourId={tourId}
        step={contentStep}
        body={contentBody}
        actionNumber={actionNumber}
        actionTotal={actionTotal}
        width={cardWidth}
        placement={placement}
        visible={cardVisible}
        motion={motion}
        nudgeCount={nudgeCount}
        titleRef={titleRef}
        completion={contentStep.kind === "finale" ? completion : null}
        showBack={showBack}
        onMeasured={onMeasured}
        onNext={next}
        onBack={back}
        onAction={onAction}
        onSkip={skip}
        onStartNext={onStartNext}
        minTop={
          (samplePillVisible ? samplePillTop + SAMPLE_PILL_ROOM - SAMPLE_PILL_GAP : insets.top) +
          TOUR_CARD_MARGIN
        }
        maxBottom={size.height - insets.bottom - TOUR_CARD_MARGIN}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 1000, elevation: 100 },
  hidden: { opacity: 0 },
});

/**
 * Hides the tour (keeping its place in the store) while the user is somewhere it does not own: a
 * form, Settings, a modal flow it did not open. The stage mounts again, at the stored step, when
 * they come back. Sample data follows: real data shows while the tour is hidden.
 */
function TourSession() {
  const tourId = useAppTourStore((s) => s.tourId);
  const runId = useAppTourStore((s) => s.runId);
  const paused = useTourPaused(tourId);
  const window = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const motion = getTourMotion(reduceMotion);
  const scrim = useTourScrimValues({ x: window.width / 2, y: window.height / 2 });

  useEffect(() => {
    setTourPreviewSuspended(paused);
  }, [paused]);

  // The celebration layer's one canvas is made now, while the first card loads, rather than in the
  // middle of the tour at the first coin burst.
  useEffect(() => {
    useCelebrationStore.getState().prime();
  }, []);

  return (
    // Above everything in the app, floating buttons included (their elevation would otherwise win).
    <View style={[StyleSheet.absoluteFill, styles.root]} pointerEvents="box-none">
      {/* The run's only Skia canvas: created once with the session, hidden (not destroyed) while paused. */}
      <View
        style={[StyleSheet.absoluteFill, paused && styles.hidden]}
        pointerEvents="none"
      >
        <TourScrim
          width={window.width}
          height={window.height}
          {...scrim}
          trail={
            motion.sparkle
              ? {
                  fromX: scrim.trailFromX,
                  fromY: scrim.trailFromY,
                  toX: scrim.trailToX,
                  toY: scrim.trailToY,
                  clock: scrim.trailClock,
                }
              : undefined
          }
          ripple={
            motion.ripple
              ? { x: scrim.rippleX, y: scrim.rippleY, clock: scrim.rippleClock }
              : undefined
          }
          warp={
            motion.ripple
              ? { x: scrim.warpX, y: scrim.warpY, clock: scrim.warpClock }
              : undefined
          }
        />
      </View>
      {paused ? null : <TourStage key={runId} scrim={scrim} />}
    </View>
  );
}

/**
 * The guided app tours. Mounted once at the app root (above the navigator, so spotlight
 * coordinates match the window); renders nothing until a tour is started.
 */
export function AppTourOverlay() {
  const active = useAppTourStore((s) => s.active);
  return active ? <TourSession /> : null;
}
