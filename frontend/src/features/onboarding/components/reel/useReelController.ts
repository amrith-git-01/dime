import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useReducer, useState } from "react";
import {
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { timings } from "@/constants/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { triggerTickHaptic } from "@/lib/haptics/nativeHaptics";

import { useAppIsActive, useScreenReaderEnabled } from "./reelEnvironment";
import {
  isReelAnimating,
  REEL_SCENE_MS,
  shouldAutoAdvance,
} from "./reelLogic";
import {
  INITIAL_REEL_STATE,
  isClockRunning,
  reelReducer,
  shouldStepAfterEnd,
} from "./reelMachine";

/** How far (dp) a scene slides while it leaves / arrives. */
const SHIFT_DP = 12;
const EXIT_MS = timings.fast.duration;
/** A long frame (jank, a debugger pause) advances the clock by at most this much. */
const MAX_FRAME_MS = 100;

export type ReelController = ReturnType<typeof useReelController>;

/**
 * Owns the reel: which scene is active, the scene clock (ms), the crossfade and every reason
 * the reel pauses.
 *
 * Threading rule that keeps it deterministic: the JS thread only WRITES shared values and never
 * reads them. (A JS write is queued to the UI thread while a JS read runs on it immediately, so
 * a read right after a write can see the old value; reading the clock to decide how to restart
 * it is what made the reel freeze.) The clock itself is advanced by a UI-thread frame callback
 * from a `running` flag, and the end of a scene is reported back tagged with its generation.
 */
export function useReelController({ paused }: { paused: boolean }) {
  const reduceMotion = useReduceMotion();
  const screenReader = useScreenReaderEnabled();
  const appActive = useAppIsActive();
  const screenFocused = useIsFocused();

  const [state, dispatch] = useReducer(reelReducer, INITIAL_REEL_STATE);
  const [pressHeld, setPressHeld] = useState(false);
  const [dragHeld, setDragHeld] = useState(false);

  /** ms since the playing scene started; every scene derives its frame from it. */
  const clock = useSharedValue(0);
  /** Scene opacity: 0 while swapping scenes. */
  const fade = useSharedValue(1);
  /** Scene translateX (dp) while swapping. */
  const shift = useSharedValue(0);
  /** 1 while the clock should advance. */
  const running = useSharedValue(0);
  /** Generation of the scene the clock currently belongs to. */
  const sceneGen = useSharedValue(-1);

  const runInputs = {
    appActive,
    screenFocused,
    externalPause: paused,
    held: pressHeld || dragHeld,
    reduceMotion,
    screenReader,
  };
  const animating = isReelAnimating(runInputs);
  const autoAdvance = shouldAutoAdvance(runInputs);

  // UI thread: advance the clock while running. Registered inactive and switched on only while
  // the clock runs, so a paused / hidden / reduced-motion reel requests no frames at all.
  const frameCallback = useFrameCallback((frame) => {
    "worklet";
    if (running.value !== 1) {
      return;
    }
    const dt = Math.min(frame.timeSincePreviousFrame ?? 0, MAX_FRAME_MS);
    if (dt > 0) {
      clock.value = Math.min(REEL_SCENE_MS, clock.value + dt);
    }
  }, false);

  const onSceneEnd = useCallback((gen: number) => {
    dispatch({ type: "sceneEnd", gen });
  }, []);

  // UI thread: report the end of the scene, tagged with the generation it belongs to.
  useAnimatedReaction(
    () =>
      running.value === 1 && clock.value >= REEL_SCENE_MS ? sceneGen.value : -1,
    (gen, previous) => {
      if (gen >= 0 && gen !== previous) {
        runOnJS(onSceneEnd)(gen);
      }
    },
  );

  // Reduced motion changes restart the scene (final frame on, replay off).
  useEffect(() => {
    dispatch({ type: "setReduceMotion", value: reduceMotion });
  }, [reduceMotion]);

  // Scene setup per generation: swap out (timer owned by this effect, cleared by its cleanup,
  // so only the latest generation can ever finish a swap) or start a scene from its beginning.
  const { gen, phase, direction } = state;
  const stateReduceMotion = state.reduceMotion;
  useEffect(() => {
    if (phase === "exiting") {
      fade.value = withTiming(0, timings.fast);
      shift.value = withTiming(-direction * SHIFT_DP, timings.fast);
      const timer = setTimeout(
        () => dispatch({ type: "exitDone", gen }),
        EXIT_MS,
      );
      return () => clearTimeout(timer);
    }

    sceneGen.value = gen;
    if (stateReduceMotion) {
      clock.value = REEL_SCENE_MS;
      fade.value = 1;
      shift.value = 0;
      return;
    }
    clock.value = 0;
    if (gen === 0) {
      fade.value = 1;
      shift.value = 0;
      return;
    }
    fade.value = 0;
    shift.value = direction * SHIFT_DP;
    fade.value = withTiming(1, timings.normal);
    shift.value = withTiming(0, timings.normal);
  }, [gen, phase, direction, stateReduceMotion, clock, fade, shift, sceneGen]);

  // Declared after the setup effect on purpose: on a new scene the clock is reset first, then
  // released (writes reach the UI thread in order).
  const clockRunning = isClockRunning(phase, animating);
  useEffect(() => {
    running.value = clockRunning ? 1 : 0;
    frameCallback.setActive(clockRunning);
  }, [clockRunning, running, frameCallback]);

  // Never leave the frame loop registered once the reel is gone.
  useEffect(() => () => frameCallback.setActive(false), [frameCallback]);

  // A finished scene moves on by itself when auto-advance is allowed.
  const stepAfterEnd = shouldStepAfterEnd(state, autoAdvance);
  useEffect(() => {
    if (stepAfterEnd) {
      dispatch({ type: "step", delta: 1 });
    }
  }, [stepAfterEnd]);

  useEffect(
    () => () => {
      cancelAnimation(fade);
      cancelAnimation(shift);
    },
    [fade, shift],
  );

  const goNext = useCallback((haptic: boolean) => {
    if (haptic) {
      void triggerTickHaptic();
    }
    dispatch({ type: "step", delta: 1 });
  }, []);
  const goPrev = useCallback((haptic: boolean) => {
    if (haptic) {
      void triggerTickHaptic();
    }
    dispatch({ type: "step", delta: -1 });
  }, []);
  const jumpTo = useCallback((target: number) => {
    dispatch({ type: "jump", target });
  }, []);

  return {
    index: state.index,
    phase,
    clock,
    fade,
    shift,
    running,
    sceneGen,
    /** The reduced-motion setting the playing scene was set up with (what the scenes render). */
    reduceMotion: stateReduceMotion,
    screenReader,
    goNext,
    goPrev,
    jumpTo,
    onSceneEnd,
    setPressHeld,
    setDragHeld,
  };
}
