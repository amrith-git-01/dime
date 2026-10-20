import {
  computeReelLayout,
  getSegmentFill,
  isReelAnimating,
  nextIndex,
  prevIndex,
  REEL_CARD_HEIGHT,
  REEL_CARD_WIDTH,
  REEL_CHROME_HEIGHT,
  REEL_MIN_SCALE,
  REEL_SCENE_COUNT,
  REEL_SCENES,
  reelAccessibilityLabel,
  resolveSegmentJump,
  resolveSwipe,
  shouldAutoAdvance,
  wrapIndex,
  type ReelRunInputs,
} from "../reelLogic";

const RUNNING: ReelRunInputs = {
  appActive: true,
  screenFocused: true,
  externalPause: false,
  held: false,
  reduceMotion: false,
  screenReader: false,
};

describe("scene list", () => {
  it("has six scenes with the agreed captions, in order", () => {
    expect(REEL_SCENE_COUNT).toBe(6);
    expect(REEL_SCENES.map((scene) => scene.caption)).toEqual([
      "Add it in seconds",
      "Just say it",
      "Snap the receipt",
      "Know what's left",
      "See where it went",
      "Ask anything",
    ]);
  });
});

describe("index math", () => {
  it("advances and wraps from the last scene to the first", () => {
    expect(nextIndex(0)).toBe(1);
    expect(nextIndex(4)).toBe(5);
    expect(nextIndex(5)).toBe(0);
  });

  it("goes back and wraps from the first scene to the last", () => {
    expect(prevIndex(3)).toBe(2);
    expect(prevIndex(0)).toBe(5);
  });

  it("wraps arbitrary integers into range", () => {
    expect(wrapIndex(-1)).toBe(5);
    expect(wrapIndex(-7)).toBe(5);
    expect(wrapIndex(6)).toBe(0);
    expect(wrapIndex(13)).toBe(1);
    expect(wrapIndex(2, 0)).toBe(0);
  });

  it("a full lap of next returns to the start", () => {
    let index = 2;
    for (let i = 0; i < REEL_SCENE_COUNT; i += 1) {
      index = nextIndex(index);
    }
    expect(index).toBe(2);
  });
});

describe("segment jump", () => {
  it("jumps to any scene in range", () => {
    expect(resolveSegmentJump(4, 0)).toBe(4);
    expect(resolveSegmentJump(0, 3)).toBe(0);
  });

  it("keeps the current scene for out-of-range or non-integer targets", () => {
    expect(resolveSegmentJump(-1, 2)).toBe(2);
    expect(resolveSegmentJump(6, 2)).toBe(2);
    expect(resolveSegmentJump(1.5, 2)).toBe(2);
    expect(resolveSegmentJump(Number.NaN, 2)).toBe(2);
  });
});

describe("pause conditions", () => {
  it("animates and auto-advances when nothing blocks it", () => {
    expect(isReelAnimating(RUNNING)).toBe(true);
    expect(shouldAutoAdvance(RUNNING)).toBe(true);
  });

  it.each([
    ["the app is in the background", { appActive: false }],
    ["the screen is not focused", { screenFocused: false }],
    ["Google sign-in is in progress", { externalPause: true }],
    ["the user is holding the card", { held: true }],
  ] as const)("pauses when %s", (_name, override) => {
    const inputs = { ...RUNNING, ...override };
    expect(isReelAnimating(inputs)).toBe(false);
    expect(shouldAutoAdvance(inputs)).toBe(false);
  });

  it("reduced motion never animates or auto-advances", () => {
    const inputs = { ...RUNNING, reduceMotion: true };
    expect(isReelAnimating(inputs)).toBe(false);
    expect(shouldAutoAdvance(inputs)).toBe(false);
  });

  it("a screen reader keeps the animations but stops auto-advance", () => {
    const inputs = { ...RUNNING, screenReader: true };
    expect(isReelAnimating(inputs)).toBe(true);
    expect(shouldAutoAdvance(inputs)).toBe(false);
  });
});

describe("swipe resolution", () => {
  it("a long drag left goes next, right goes previous", () => {
    expect(resolveSwipe(-60, 0)).toBe(1);
    expect(resolveSwipe(60, 0)).toBe(-1);
  });

  it("a short fast fling counts, a short slow drag does not", () => {
    expect(resolveSwipe(-20, -900)).toBe(1);
    expect(resolveSwipe(20, 900)).toBe(-1);
    expect(resolveSwipe(-20, -100)).toBe(0);
    expect(resolveSwipe(0, 0)).toBe(0);
  });

  it("ignores a fast flick that barely moved (a tap)", () => {
    expect(resolveSwipe(2, 900)).toBe(0);
  });
});

describe("segment fill", () => {
  it("fills past, runs the active one and empties the rest", () => {
    expect(getSegmentFill(0, 2, false)).toBe("full");
    expect(getSegmentFill(1, 2, false)).toBe("full");
    expect(getSegmentFill(2, 2, false)).toBe("live");
    expect(getSegmentFill(3, 2, false)).toBe("empty");
  });

  it("with reduced motion only the active segment is filled", () => {
    expect(getSegmentFill(0, 2, true)).toBe("empty");
    expect(getSegmentFill(2, 2, true)).toBe("full");
    expect(getSegmentFill(5, 2, true)).toBe("empty");
  });
});

describe("accessibility label", () => {
  it("names the feature preview, its caption and the position", () => {
    expect(reelAccessibilityLabel(0)).toBe(
      "Feature preview, Add it in seconds, 1 of 6",
    );
    expect(reelAccessibilityLabel(5)).toBe(
      "Feature preview, Ask anything, 6 of 6",
    );
  });

  it("wraps an out-of-range index", () => {
    expect(reelAccessibilityLabel(6)).toBe(
      "Feature preview, Add it in seconds, 1 of 6",
    );
  });
});

describe("layout fitting", () => {
  it("uses full size when there is plenty of room", () => {
    const layout = computeReelLayout(328, REEL_CARD_HEIGHT + REEL_CHROME_HEIGHT + 80);
    expect(layout.visible).toBe(true);
    expect(layout.scale).toBe(1);
    expect(layout.width).toBe(REEL_CARD_WIDTH);
    expect(layout.height).toBe(REEL_CARD_HEIGHT);
  });

  it("scales the card down to the room left after the chrome", () => {
    const room = 200;
    const layout = computeReelLayout(328, room + REEL_CHROME_HEIGHT);
    expect(layout.visible).toBe(true);
    expect(layout.height).toBeCloseTo(room, 5);
    expect(layout.scale).toBeCloseTo(room / REEL_CARD_HEIGHT, 5);
  });

  it("scales for narrow screens too", () => {
    const layout = computeReelLayout(288, 600);
    expect(layout.scale).toBeCloseTo(288 / REEL_CARD_WIDTH, 5);
  });

  it("never goes below the minimum scale", () => {
    const layout = computeReelLayout(328, 125 + REEL_CHROME_HEIGHT);
    expect(layout.visible).toBe(true);
    expect(layout.scale).toBe(REEL_MIN_SCALE);
  });

  it("hides when almost no room is left", () => {
    expect(computeReelLayout(328, 100 + REEL_CHROME_HEIGHT).visible).toBe(false);
    expect(computeReelLayout(328, 0).visible).toBe(false);
    expect(computeReelLayout(0, 700).visible).toBe(false);
  });
});
