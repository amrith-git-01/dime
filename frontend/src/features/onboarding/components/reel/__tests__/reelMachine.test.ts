import {
  INITIAL_REEL_STATE,
  isClockRunning,
  reelReducer,
  shouldStepAfterEnd,
  type ReelAction,
  type ReelState,
} from "../reelMachine";

function run(actions: ReelAction[], from: ReelState = INITIAL_REEL_STATE) {
  return actions.reduce(reelReducer, from);
}

const exiting = (state: ReelState) => state.phase === "exiting";

describe("a normal swap", () => {
  it("step starts an exit, exitDone lands on the next scene with a new generation", () => {
    const afterStep = run([{ type: "step", delta: 1 }]);
    expect(afterStep).toMatchObject({
      index: 0,
      phase: "exiting",
      target: 1,
      direction: 1,
    });
    expect(afterStep.gen).toBeGreaterThan(INITIAL_REEL_STATE.gen);

    const landed = reelReducer(afterStep, { type: "exitDone", gen: afterStep.gen });
    expect(landed).toMatchObject({
      index: 1,
      phase: "playing",
      target: null,
      ended: false,
    });
    expect(landed.gen).toBeGreaterThan(afterStep.gen);
  });

  it("goes through every scene and wraps back to the first", () => {
    let state = INITIAL_REEL_STATE;
    const seen: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      state = reelReducer(state, { type: "step", delta: 1 });
      state = reelReducer(state, { type: "exitDone", gen: state.gen });
      seen.push(state.index);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 0]);
  });

  it("previous from the first scene wraps to the last", () => {
    const state = run([{ type: "step", delta: -1 }]);
    expect(state).toMatchObject({ target: 5, direction: -1 });
  });
});

describe("scene end", () => {
  it("is recorded once for the playing generation", () => {
    const state = run([{ type: "sceneEnd", gen: INITIAL_REEL_STATE.gen }]);
    expect(state.ended).toBe(true);
    expect(reelReducer(state, { type: "sceneEnd", gen: state.gen })).toBe(state);
  });

  it("ignores an end reported for an older generation", () => {
    const swapping = run([{ type: "step", delta: 1 }]);
    const landed = reelReducer(swapping, { type: "exitDone", gen: swapping.gen });
    // The end of the scene that was just replaced arrives late.
    const state = reelReducer(landed, { type: "sceneEnd", gen: INITIAL_REEL_STATE.gen });
    expect(state).toBe(landed);
    expect(state.ended).toBe(false);
  });

  it("ignores an end that arrives mid-swap", () => {
    const swapping = run([{ type: "step", delta: 1 }]);
    expect(reelReducer(swapping, { type: "sceneEnd", gen: swapping.gen })).toBe(swapping);
  });

  it("only steps on by itself when playing, ended and allowed", () => {
    const ended = run([{ type: "sceneEnd", gen: 0 }]);
    expect(shouldStepAfterEnd(ended, true)).toBe(true);
    expect(shouldStepAfterEnd(ended, false)).toBe(false);
    expect(shouldStepAfterEnd(INITIAL_REEL_STATE, true)).toBe(false);
    const swapping = reelReducer(ended, { type: "step", delta: 1 });
    expect(swapping.ended).toBe(false);
    expect(shouldStepAfterEnd(swapping, true)).toBe(false);
  });
});

describe("rapid swipes during a fade", () => {
  it("accumulates: three swipes land three scenes on", () => {
    const state = run([
      { type: "step", delta: 1 },
      { type: "step", delta: 1 },
      { type: "step", delta: 1 },
    ]);
    expect(exiting(state)).toBe(true);
    expect(state.target).toBe(3);
    const landed = reelReducer(state, { type: "exitDone", gen: state.gen });
    expect(landed).toMatchObject({ index: 3, phase: "playing" });
  });

  it("a stale exit timer (older generation) cannot land a scene", () => {
    const first = run([{ type: "step", delta: 1 }]);
    const second = reelReducer(first, { type: "step", delta: 1 });
    expect(reelReducer(second, { type: "exitDone", gen: first.gen })).toBe(second);
    const landed = reelReducer(second, { type: "exitDone", gen: second.gen });
    expect(landed.index).toBe(2);
    // The first timer firing after the landing is also ignored.
    expect(reelReducer(landed, { type: "exitDone", gen: first.gen })).toBe(landed);
  });

  it("swiping back mid-swap heads to the previous scene instead of stalling", () => {
    const state = run([
      { type: "step", delta: 1 },
      { type: "step", delta: -1 },
    ]);
    expect(state).toMatchObject({ phase: "exiting", target: 0, direction: -1 });
    const landed = reelReducer(state, { type: "exitDone", gen: state.gen });
    expect(landed).toMatchObject({ index: 0, phase: "playing" });
  });

  it("requesting the target already being swapped in changes nothing", () => {
    const state = run([{ type: "step", delta: 1 }]);
    expect(reelReducer(state, { type: "jump", target: 1 })).toBe(state);
  });

  it("every swap ends in the playing phase on exactly one scene", () => {
    let state = INITIAL_REEL_STATE;
    const actions: ReelAction[] = [
      { type: "step", delta: 1 },
      { type: "jump", target: 4 },
      { type: "step", delta: -1 },
      { type: "jump", target: 0 },
    ];
    for (const action of actions) {
      state = reelReducer(state, action);
    }
    const landed = reelReducer(state, { type: "exitDone", gen: state.gen });
    expect(landed.phase).toBe("playing");
    expect(landed.target).toBeNull();
    expect(landed.index).toBe(0);
  });
});

describe("segment jump", () => {
  it("jumps to a scene and picks the direction from where it was", () => {
    expect(run([{ type: "jump", target: 4 }])).toMatchObject({ target: 4, direction: 1 });
    const at4 = run([
      { type: "jump", target: 4 },
      { type: "exitDone", gen: 1 },
    ]);
    expect(at4.index).toBe(4);
    expect(reelReducer(at4, { type: "jump", target: 1 })).toMatchObject({
      target: 1,
      direction: -1,
    });
  });

  it("ignores the current scene and out-of-range targets while playing", () => {
    expect(run([{ type: "jump", target: 0 }])).toBe(INITIAL_REEL_STATE);
    expect(run([{ type: "jump", target: 9 }])).toBe(INITIAL_REEL_STATE);
    expect(run([{ type: "jump", target: -1 }])).toBe(INITIAL_REEL_STATE);
  });
});

describe("reduced motion", () => {
  const reduced = reelReducer(INITIAL_REEL_STATE, {
    type: "setReduceMotion",
    value: true,
  });

  it("restarts the scene with a new generation, and is a no-op when unchanged", () => {
    expect(reduced.reduceMotion).toBe(true);
    expect(reduced.gen).toBeGreaterThan(INITIAL_REEL_STATE.gen);
    expect(reelReducer(reduced, { type: "setReduceMotion", value: true })).toBe(reduced);
  });

  it("switches scenes instantly, with no exit phase", () => {
    const next = reelReducer(reduced, { type: "step", delta: 1 });
    expect(next).toMatchObject({ index: 1, phase: "playing", target: null });
    expect(reelReducer(next, { type: "jump", target: 4 })).toMatchObject({ index: 4 });
  });

  it("never records a scene end", () => {
    expect(reelReducer(reduced, { type: "sceneEnd", gen: reduced.gen })).toBe(reduced);
  });

  it("turning it on mid-swap lands the pending scene immediately", () => {
    const swapping = run([{ type: "step", delta: 1 }]);
    const state = reelReducer(swapping, { type: "setReduceMotion", value: true });
    expect(state).toMatchObject({ index: 1, phase: "playing", target: null });
    // The pending exit timer is now stale.
    expect(reelReducer(state, { type: "exitDone", gen: swapping.gen })).toBe(state);
  });

  it("turning it off replays the scene from the start", () => {
    const state = reelReducer(reduced, { type: "setReduceMotion", value: false });
    expect(state).toMatchObject({ reduceMotion: false, phase: "playing", ended: false });
    expect(state.gen).toBeGreaterThan(reduced.gen);
  });
});

describe("clock running", () => {
  it("runs only while playing and animating", () => {
    expect(isClockRunning("playing", true)).toBe(true);
    expect(isClockRunning("playing", false)).toBe(false);
    expect(isClockRunning("exiting", true)).toBe(false);
    expect(isClockRunning("exiting", false)).toBe(false);
  });
});
