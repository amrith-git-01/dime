import { REEL_SCENE_COUNT, resolveSegmentJump, wrapIndex } from "./reelLogic";

/**
 * The reel's scene state machine, pure and unit tested.
 *
 * One source of truth for "which scene, and are we mid-swap":
 *  - `playing`: `index` is on screen and its clock may run.
 *  - `exiting`: `index` is fading out towards `target`; the clock is stopped.
 *
 * `gen` increments on every transition. Everything asynchronous (the exit timer, the "scene
 * ended" event raised on the UI thread) carries the generation it was started for and is
 * ignored when it no longer matches, so a stale callback can never move the reel.
 */

export type ReelPhase = "playing" | "exiting";

export type ReelState = {
  index: number;
  phase: ReelPhase;
  /** Scene being swapped in while `exiting`; null while `playing`. */
  target: number | null;
  /** +1 slides the scene out to the left (next), -1 to the right (previous). */
  direction: 1 | -1;
  gen: number;
  /** `gen` of the scene on screen: set whenever a scene starts playing, kept while a swap is `exiting`. */
  activeGen: number;
  /** The playing scene's clock reached its end (only set while `playing`). */
  ended: boolean;
  reduceMotion: boolean;
};

export type ReelAction =
  | { type: "step"; delta: 1 | -1 }
  | { type: "jump"; target: number }
  | { type: "exitDone"; gen: number }
  | { type: "sceneEnd"; gen: number }
  | { type: "setReduceMotion"; value: boolean };

export const INITIAL_REEL_STATE: ReelState = {
  index: 0,
  phase: "playing",
  target: null,
  direction: 1,
  gen: 0,
  activeGen: 0,
  ended: false,
  reduceMotion: false,
};

/** The scene a new request is relative to: where an in-flight swap is heading, else the current. */
function baseIndex(state: ReelState): number {
  return state.phase === "exiting" && state.target != null
    ? state.target
    : state.index;
}

function requestScene(
  state: ReelState,
  rawTarget: number,
  direction: 1 | -1,
): ReelState {
  const target = wrapIndex(rawTarget, REEL_SCENE_COUNT);

  if (state.reduceMotion) {
    if (state.phase === "playing" && target === state.index) {
      return state;
    }
    return {
      ...state,
      index: target,
      phase: "playing",
      target: null,
      direction,
      gen: state.gen + 1,
      activeGen: state.gen + 1,
      ended: false,
    };
  }

  if (state.phase === "playing" && target === state.index) {
    return state;
  }
  if (state.phase === "exiting" && target === state.target) {
    return state;
  }
  return {
    ...state,
    phase: "exiting",
    target,
    direction,
    gen: state.gen + 1,
    ended: false,
  };
}

export function reelReducer(state: ReelState, action: ReelAction): ReelState {
  switch (action.type) {
    case "step":
      return requestScene(
        state,
        baseIndex(state) + action.delta,
        action.delta,
      );

    case "jump": {
      const base = baseIndex(state);
      const target = resolveSegmentJump(action.target, base, REEL_SCENE_COUNT);
      if (target === base && state.phase === "playing") {
        return state;
      }
      return requestScene(state, target, target > base ? 1 : -1);
    }

    case "exitDone":
      if (
        state.phase !== "exiting" ||
        state.target == null ||
        action.gen !== state.gen
      ) {
        return state;
      }
      return {
        ...state,
        index: state.target,
        phase: "playing",
        target: null,
        gen: state.gen + 1,
        activeGen: state.gen + 1,
        ended: false,
      };

    case "sceneEnd":
      if (
        state.phase !== "playing" ||
        action.gen !== state.gen ||
        state.ended ||
        state.reduceMotion
      ) {
        return state;
      }
      return { ...state, ended: true };

    case "setReduceMotion":
      if (action.value === state.reduceMotion) {
        return state;
      }
      // The scene restarts (or jumps to its final frame); a pending swap lands immediately.
      return {
        ...state,
        index: baseIndex(state),
        phase: "playing",
        target: null,
        reduceMotion: action.value,
        gen: state.gen + 1,
        activeGen: state.gen + 1,
        ended: false,
      };
  }
}

/** The scene clock runs only while a scene is playing and nothing pauses the reel. */
export function isClockRunning(phase: ReelPhase, animating: boolean): boolean {
  return phase === "playing" && animating;
}

/** The reel moves on by itself once the playing scene has ended and nothing blocks it. */
export function shouldStepAfterEnd(
  state: ReelState,
  autoAdvance: boolean,
): boolean {
  return state.phase === "playing" && state.ended && autoAdvance;
}
