/**
 * The story player's slide state machine, pure and unit tested.
 *
 * Unlike the Welcome reel it never wraps: "next" on the last slide stays on it, and "previous" on
 * the first slide restarts it. `gen` increments whenever a slide (re)starts; everything
 * asynchronous (the end-of-slide event raised on the UI thread) carries the generation it was
 * started for and is ignored when it no longer matches, so a stale callback can never move the story.
 */

export type StoryState = {
  index: number;
  count: number;
  gen: number;
  /** The playing slide's clock reached its end. */
  ended: boolean;
  /** Reduced motion or a screen reader: slides render their final frame and never auto-advance. */
  staticFrames: boolean;
};

export type StoryAction =
  | { type: "step"; delta: 1 | -1 }
  | { type: "jump"; target: number }
  | { type: "slideEnd"; gen: number }
  | { type: "setStatic"; value: boolean };

export function createStoryState(count: number, staticFrames = false): StoryState {
  return { index: 0, count: Math.max(0, count), gen: 0, ended: false, staticFrames };
}

function moveTo(state: StoryState, index: number): StoryState {
  return { ...state, index, gen: state.gen + 1, ended: false };
}

export function storyReducer(state: StoryState, action: StoryAction): StoryState {
  switch (action.type) {
    case "step": {
      if (state.count === 0) {
        return state;
      }
      if (action.delta === 1) {
        // The last slide is the end of the story: stay on it.
        return state.index >= state.count - 1 ? state : moveTo(state, state.index + 1);
      }
      // Previous on the first slide restarts it.
      return moveTo(state, Math.max(0, state.index - 1));
    }

    case "jump": {
      const { target } = action;
      if (
        !Number.isInteger(target) ||
        target < 0 ||
        target >= state.count ||
        target === state.index
      ) {
        return state;
      }
      return moveTo(state, target);
    }

    case "slideEnd":
      if (action.gen !== state.gen || state.ended || state.staticFrames) {
        return state;
      }
      return { ...state, ended: true };

    case "setStatic":
      if (action.value === state.staticFrames) {
        return state;
      }
      // The slide restarts so it draws its final frame (or plays from the start again).
      return { ...moveTo(state, state.index), staticFrames: action.value };
  }
}

/** The story moves on by itself once the playing slide has ended, unless it is the last one. */
export function shouldAutoAdvance(state: StoryState): boolean {
  return !state.staticFrames && state.ended && state.index < state.count - 1;
}
