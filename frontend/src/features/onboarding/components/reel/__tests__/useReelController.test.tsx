import { REEL_SCENE_MS } from "../reelLogic";
import { useReelController, type ReelController } from "../useReelController";

jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerTickHaptic: jest.fn(() => Promise.resolve()),
}));
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => true }));

// A small simulator of the UI thread: the frame callback and the reaction the hook registers
// are captured, and `frame()` plays one frame (advance the clock, then evaluate the reaction).
type Sim = {
  frame: ((info: { timeSincePreviousFrame: number | null }) => void) | null;
  reaction: {
    prepare: () => number;
    react: (value: number, previous: number | undefined) => void;
  } | null;
  previous: number | undefined;
  /** Every `setActive` call the hook made on its frame callback. */
  active: boolean[];
};
const globals = globalThis as unknown as { __reelSim?: Sim };
globals.__reelSim = { frame: null, reaction: null, previous: undefined, active: [] };
const sim = globals.__reelSim;

jest.mock("react-native-reanimated", () => {
  const React = jest.requireActual("react");
  const shared = () => (globalThis as unknown as { __reelSim: Sim }).__reelSim;
  return {
    ...jest.requireActual("react-native-reanimated/mock"),
    // The official mock builds a new object per render; the hook needs a stable one.
    useSharedValue: (initial: number) =>
      React.useState(() => ({ value: initial }))[0],
    useFrameCallback: (callback: Sim["frame"]) => {
      shared().frame = callback;
      return { setActive: (active: boolean) => shared().active.push(active) };
    },
    useAnimatedReaction: (
      prepare: () => number,
      react: (value: number, previous: number | undefined) => void,
    ) => {
      shared().reaction = { prepare, react };
    },
  };
});

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => {
    unmount: () => void;
    update: (element: React.ReactElement) => void;
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

let controller!: ReelController;

function Harness({ paused }: { paused: boolean }) {
  controller = useReelController({ paused });
  return null;
}

type Mounted = { setPaused: (paused: boolean) => void; unmount: () => void };

async function mount(): Promise<Mounted> {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<Harness paused={false} />);
  });
  return {
    setPaused: (paused: boolean) =>
      act(() => {
        tree.update(<Harness paused={paused} />);
      }) as void,
    unmount: () =>
      act(() => {
        tree.unmount();
      }) as void,
  };
}

/** Plays `ms` of frames (16 ms each); the reaction is evaluated after every frame. */
function play(ms: number) {
  act(() => {
    for (let t = 0; t < ms; t += 16) {
      sim.frame?.({ timeSincePreviousFrame: 16 });
      const current = sim.reaction?.prepare() ?? -1;
      if (current !== sim.previous) {
        const previous = sim.previous;
        sim.previous = current;
        sim.reaction?.react(current, previous);
      }
    }
  });
}

/** Lets the exit fade's timer fire. */
function finishFade() {
  act(() => {
    jest.advanceTimersByTime(400);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  sim.frame = null;
  sim.reaction = null;
  sim.previous = undefined;
  sim.active = [];
});
afterEach(() => {
  jest.useRealTimers();
});

describe("useReelController", () => {
  it("runs the first scene's clock and advances when it ends", async () => {
    const reel = await mount();
    expect(controller.index).toBe(0);
    expect(controller.running.value).toBe(1);

    play(REEL_SCENE_MS / 2);
    expect(controller.clock.value).toBeGreaterThan(1500);
    expect(controller.index).toBe(0);

    play(REEL_SCENE_MS);
    expect(controller.phase).toBe("exiting");
    finishFade();
    expect(controller.index).toBe(1);
    reel.unmount();
  });

  it("restarts the clock deterministically on every new scene (the freeze regression)", async () => {
    const reel = await mount();
    for (let scene = 1; scene <= 7; scene += 1) {
      play(REEL_SCENE_MS + 100);
      finishFade();
      expect(controller.index).toBe(scene % 6);
      // The clock was reset and released: the new scene starts from its beginning and moves.
      expect(controller.clock.value).toBe(0);
      expect(controller.running.value).toBe(1);
      play(500);
      expect(controller.clock.value).toBeGreaterThan(400);
      expect(controller.fade.value).toBe(1);
    }
    reel.unmount();
  });

  it("a scene is never cut short: it only ends when its clock reaches the end", async () => {
    const reel = await mount();
    play(REEL_SCENE_MS - 200);
    expect(controller.phase).toBe("playing");
    expect(controller.index).toBe(0);
    reel.unmount();
  });

  it("rapid swipes during a fade accumulate and land exactly once", async () => {
    const reel = await mount();
    play(800);
    act(() => {
      controller.goNext(true);
      controller.goNext(true);
      controller.goNext(true);
    });
    expect(controller.phase).toBe("exiting");
    expect(controller.running.value).toBe(0);
    finishFade();
    expect(controller.index).toBe(3);
    expect(controller.phase).toBe("playing");
    expect(controller.clock.value).toBe(0);
    play(300);
    expect(controller.clock.value).toBeGreaterThan(200);
    reel.unmount();
  });

  it("a swipe landing right after a scene ended is not undone by the late end event", async () => {
    const reel = await mount();
    play(REEL_SCENE_MS + 50);
    // The reaction already moved the reel on; a manual swipe on top of it still lands once.
    act(() => {
      controller.goPrev(false);
    });
    finishFade();
    expect(controller.phase).toBe("playing");
    expect(controller.index).toBe(0);
    play(200);
    expect(controller.clock.value).toBeGreaterThan(100);
    reel.unmount();
  });

  it("a hold released during the fade resumes the new scene's clock", async () => {
    const reel = await mount();
    play(500);
    act(() => {
      controller.setPressHeld(true);
    });
    expect(controller.running.value).toBe(0);
    act(() => {
      controller.goNext(true);
    });
    act(() => {
      controller.setPressHeld(false);
    });
    expect(controller.running.value).toBe(0); // still exiting
    finishFade();
    expect(controller.index).toBe(1);
    expect(controller.running.value).toBe(1);
    play(300);
    expect(controller.clock.value).toBeGreaterThan(200);
    reel.unmount();
  });

  it("a hold still pressed when the fade ends keeps the new scene at its start until released", async () => {
    const reel = await mount();
    act(() => {
      controller.setDragHeld(true);
    });
    act(() => {
      controller.goNext(true);
    });
    finishFade();
    expect(controller.index).toBe(1);
    expect(controller.clock.value).toBe(0);
    expect(controller.running.value).toBe(0);
    play(500);
    expect(controller.clock.value).toBe(0);
    act(() => {
      controller.setDragHeld(false);
    });
    expect(controller.running.value).toBe(1);
    play(300);
    expect(controller.clock.value).toBeGreaterThan(200);
    reel.unmount();
  });

  it("pausing mid-scene freezes the clock and resuming continues from the same point", async () => {
    const reel = await mount();
    play(1000);
    const frozenAt = controller.clock.value;
    act(() => {
      controller.setPressHeld(true);
    });
    play(1000);
    expect(controller.clock.value).toBe(frozenAt);
    act(() => {
      controller.setPressHeld(false);
    });
    play(160);
    expect(controller.clock.value).toBeGreaterThan(frozenAt);
    expect(controller.clock.value).toBeLessThan(frozenAt + 400);
    reel.unmount();
  });

  it("the paused prop (Google sign-in) freezes the clock, also when set during a fade", async () => {
    const reel = await mount();
    play(600);
    const frozenAt = controller.clock.value;
    reel.setPaused(true);
    expect(controller.running.value).toBe(0);
    play(600);
    expect(controller.clock.value).toBe(frozenAt);

    act(() => {
      controller.goNext(true);
    });
    reel.setPaused(false);
    expect(controller.running.value).toBe(0); // fading out
    finishFade();
    expect(controller.index).toBe(1);
    expect(controller.running.value).toBe(1);

    reel.setPaused(true);
    expect(controller.running.value).toBe(0);
    play(400);
    expect(controller.clock.value).toBe(0);
    reel.setPaused(false);
    play(320);
    expect(controller.clock.value).toBeGreaterThan(200);
    reel.unmount();
  });

  it("requests frames only while the clock runs", async () => {
    const reel = await mount();
    const isActive = () => sim.active[sim.active.length - 1];
    expect(isActive()).toBe(true);

    reel.setPaused(true);
    expect(isActive()).toBe(false);
    reel.setPaused(false);
    expect(isActive()).toBe(true);

    act(() => {
      controller.setPressHeld(true);
    });
    expect(isActive()).toBe(false);
    act(() => {
      controller.setPressHeld(false);
    });

    // No frames during the swap fade either; they restart with the new scene.
    act(() => {
      controller.goNext(false);
    });
    expect(isActive()).toBe(false);
    finishFade();
    expect(isActive()).toBe(true);

    reel.unmount();
    expect(isActive()).toBe(false);
  });

  it("a scene end reported for a scene that is already gone is ignored", async () => {
    const reel = await mount();
    const firstGen = controller.sceneGen.value;
    act(() => {
      controller.goNext(false);
    });
    finishFade();
    expect(controller.index).toBe(1);
    act(() => {
      controller.onSceneEnd(firstGen);
    });
    expect(controller.phase).toBe("playing");
    expect(controller.index).toBe(1);
    reel.unmount();
  });

  it("segment jumps work during and after a fade", async () => {
    const reel = await mount();
    act(() => {
      controller.jumpTo(4);
    });
    act(() => {
      controller.jumpTo(2);
    });
    finishFade();
    expect(controller.index).toBe(2);
    expect(controller.clock.value).toBe(0);
    reel.unmount();
  });

  it("leaves no timers behind when unmounted mid-fade", async () => {
    const reel = await mount();
    const baseline = jest.getTimerCount();
    act(() => {
      controller.goNext(false);
    });
    expect(jest.getTimerCount()).toBe(baseline + 1);
    reel.unmount();
    expect(jest.getTimerCount()).toBe(baseline);
  });
});
