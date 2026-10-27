import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  runOnJS,
  useAnimatedReaction,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";

import { useReduceMotion } from "@/hooks/useReduceMotion";
import {
  useAppIsActive,
  useScreenReaderEnabled,
} from "@/hooks/useAppEnvironment";
import { triggerTickHaptic } from "@/lib/haptics/nativeHaptics";

import {
  isStoryRunning,
  usesStaticFrames,
} from "../utils/storyLogic";
import {
  createStoryState,
  shouldAutoAdvance,
  storyReducer,
} from "../utils/storyMachine";

/** A long frame (jank, a debugger pause) advances the clock by at most this much. */
const MAX_FRAME_MS = 100;

export type StoryController = ReturnType<typeof useStoryController>;

/**
 * Owns the story: which slide is on screen, the slide clock (ms since it started), and every
 * reason the story pauses (hold, background, another screen on top, the share sheet).
 *
 * The threading rule is the Welcome reel's: the JS thread only WRITES shared values and never reads
 * them. The clock is advanced by a UI-thread frame callback from a `running` flag; the end of a
 * slide is reported back tagged with its generation, so a stale report can never move the story.
 *
 * Differences from the reel: no wrap-around (the last slide stays), a duration per slide, and
 * reduced motion or a screen reader means the final frame and no auto-advance.
 */
export function useStoryController({
  durations,
  paused = false,
}: {
  /** Milliseconds each slide stays, in slide order. */
  durations: readonly number[];
  /** Something else asked for a pause (the share sheet is opening). */
  paused?: boolean;
}) {
  const reduceMotion = useReduceMotion();
  const screenReader = useScreenReaderEnabled();
  const appActive = useAppIsActive();
  const screenFocused = useIsFocused();
  const staticFrames = usesStaticFrames(reduceMotion, screenReader);

  const [state, dispatch] = useReducer(
    storyReducer,
    durations.length,
    (count) => createStoryState(count),
  );
  const [pressHeld, setPressHeld] = useState(false);
  const [dragHeld, setDragHeld] = useState(false);

  /** ms since the playing slide started; every slide derives its frame from it. */
  const clock = useSharedValue(0);
  /** How long the playing slide stays (ms). */
  const duration = useSharedValue(durations[0] ?? 0);
  /** 1 while the clock should advance. */
  const running = useSharedValue(0);
  /** Generation the clock currently belongs to (written after the clock reset). */
  const slideGen = useSharedValue(-1);

  const clockRunning =
    !staticFrames &&
    isStoryRunning({
      appActive,
      screenFocused,
      externalPause: paused,
      held: pressHeld || dragHeld,
    });

  // UI thread: advance the clock while running. Registered inactive and switched on only while
  // the clock runs, so a paused / hidden / static story requests no frames at all.
  const frameCallback = useFrameCallback((frame) => {
    "worklet";
    if (running.value !== 1) {
      return;
    }
    const dt = Math.min(frame.timeSincePreviousFrame ?? 0, MAX_FRAME_MS);
    if (dt > 0) {
      clock.value = Math.min(duration.value, clock.value + dt);
    }
  }, false);

  const onSlideEnd = useCallback((gen: number) => {
    dispatch({ type: "slideEnd", gen });
  }, []);

  // UI thread: report the end of the slide, tagged with the generation it belongs to.
  useAnimatedReaction(
    () =>
      running.value === 1 && clock.value >= duration.value ? slideGen.value : -1,
    (gen, previous) => {
      if (gen >= 0 && gen !== previous) {
        runOnJS(onSlideEnd)(gen);
      }
    },
  );

  // Reduced motion / a screen reader switching on or off restarts the slide (final frame on,
  // replay off).
  useEffect(() => {
    dispatch({ type: "setStatic", value: staticFrames });
  }, [staticFrames]);

  // Slide setup per generation: the duration and the clock are set BEFORE the slide is announced,
  // so the progress fill only reads the clock once `slideGen` matches its slide.
  const { gen, index, staticFrames: stateStatic } = state;
  const indexDuration = durations[index] ?? 0;
  useEffect(() => {
    duration.value = indexDuration;
    clock.value = stateStatic ? indexDuration : 0;
    slideGen.value = gen;
  }, [gen, indexDuration, stateStatic, clock, duration, slideGen]);

  // Declared after the setup effect on purpose: on a new slide the clock is reset first, then
  // released (writes reach the UI thread in order).
  useEffect(() => {
    running.value = clockRunning ? 1 : 0;
    frameCallback.setActive(clockRunning);
  }, [clockRunning, running, frameCallback]);

  // Never leave the frame loop registered once the story is gone.
  useEffect(() => () => frameCallback.setActive(false), [frameCallback]);

  // A finished slide moves on by itself when nothing blocks it (never off the last slide).
  const autoAdvance = shouldAutoAdvance(state);
  useEffect(() => {
    if (autoAdvance) {
      dispatch({ type: "step", delta: 1 });
    }
  }, [autoAdvance]);

  // A light tick whenever the slide changes (not for the first one).
  const lastIndex = useRef(index);
  useEffect(() => {
    if (lastIndex.current !== index) {
      lastIndex.current = index;
      void triggerTickHaptic();
    }
  }, [index]);

  const goNext = useCallback(() => dispatch({ type: "step", delta: 1 }), []);
  const goPrev = useCallback(() => dispatch({ type: "step", delta: -1 }), []);
  const jumpTo = useCallback(
    (target: number) => dispatch({ type: "jump", target }),
    [],
  );

  return {
    index,
    count: state.count,
    /** `gen` of the playing slide: what `slideGen` must reach before the clock is its own. */
    activeGen: gen,
    clock,
    duration,
    slideGen,
    /** Final frames, no auto-advance (reduced motion or a screen reader). */
    staticFrames: stateStatic,
    reduceMotion,
    screenReader,
    goNext,
    goPrev,
    jumpTo,
    setPressHeld,
    setDragHeld,
  };
}
