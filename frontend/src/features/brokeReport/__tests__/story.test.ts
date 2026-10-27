import { FULL_SNAPSHOT, MINIMAL_SNAPSHOT } from "../__fixtures__/reportFixtures";
import { resolveReportCopy } from "../copy";
import type { ReportSnapshot } from "../types";
import {
  getSegmentFill,
  isSparseReport,
  isStoryRunning,
  resolveSlides,
  resolveTapZone,
  shouldCloseOnSwipe,
  slideDurationMs,
  slideHasData,
  usesStaticFrames,
} from "../utils/storyLogic";
import {
  createStoryState,
  shouldAutoAdvance,
  storyReducer,
  type StoryAction,
  type StoryState,
} from "../utils/storyMachine";

function run(state: StoryState, ...actions: StoryAction[]): StoryState {
  return actions.reduce(storyReducer, state);
}

describe("resolveSlides", () => {
  it("keeps the server's order for a full month", () => {
    expect(resolveSlides(FULL_SNAPSHOT)).toEqual([
      "cover",
      "damage",
      "lineup",
      "regular",
      "moment",
      "rhythm",
      "win",
      "closing",
    ]);
  });

  it("plays only what the snapshot lists", () => {
    expect(resolveSlides(MINIMAL_SNAPSHOT)).toEqual(["cover", "damage", "lineup", "closing"]);
  });

  it("ignores unknown ids and repeats", () => {
    const snapshot: ReportSnapshot = {
      ...FULL_SNAPSHOT,
      slides: ["cover", "hologram", "damage", "damage", "closing"],
    };
    expect(resolveSlides(snapshot)).toEqual(["cover", "damage", "closing"]);
  });

  it("follows a reordered list", () => {
    const snapshot: ReportSnapshot = {
      ...FULL_SNAPSHOT,
      slides: ["closing", "damage", "cover"],
    };
    expect(resolveSlides(snapshot)).toEqual(["closing", "damage", "cover"]);
  });

  it("never shows a slide that lacks data", () => {
    const hollow: ReportSnapshot = {
      ...FULL_SNAPSHOT,
      categories: [],
      top_payee: null,
      biggest_spend: null,
      busiest_day: null,
      weekday: { totals: ["0", "0", "0", "0", "0", "0", "0"], peak_index: 0, weekend_share: 0 },
      win: { kind: "none" },
    };
    expect(resolveSlides(hollow)).toEqual(["cover", "damage", "closing"]);
    expect(slideHasData("lineup", hollow)).toBe(false);
    expect(slideHasData("regular", hollow)).toBe(false);
    expect(slideHasData("moment", hollow)).toBe(false);
    expect(slideHasData("rhythm", hollow)).toBe(false);
    expect(slideHasData("win", hollow)).toBe(false);
  });

  it("shows the win slide exactly when the copy has a win to tell", () => {
    const unknownKind = { ...FULL_SNAPSHOT, win: { kind: "jackpot" } as never };
    expect(slideHasData("win", unknownKind)).toBe(false);
    expect(resolveSlides(unknownKind)).not.toContain("win");
    expect(resolveReportCopy(unknownKind, "spicy").win).toBeNull();
    for (const win of [
      FULL_SNAPSHOT.win,
      { kind: "no_spend_streak", days: 3, start: "2026-10-01", end: "2026-10-03" } as const,
      { kind: "lowest_month", spent: "900", previous_lowest: "1000", months_compared: 2 } as const,
    ]) {
      const snapshot = { ...FULL_SNAPSHOT, win };
      expect(slideHasData("win", snapshot)).toBe(true);
      expect(resolveReportCopy(snapshot, "spicy").win).not.toBeNull();
    }
  });

  it("shows the moment slide with either half", () => {
    expect(slideHasData("moment", { ...FULL_SNAPSHOT, busiest_day: null })).toBe(true);
    expect(slideHasData("moment", { ...FULL_SNAPSHOT, biggest_spend: null })).toBe(true);
  });

  it("is empty for a snapshot without slides", () => {
    expect(resolveSlides({ ...FULL_SNAPSHOT, slides: [] })).toEqual([]);
  });

  it("calls a short report sparse", () => {
    expect(isSparseReport(resolveSlides(MINIMAL_SNAPSHOT))).toBe(true);
    expect(isSparseReport(resolveSlides(FULL_SNAPSHOT))).toBe(false);
  });

  it("gives denser slides longer, all within reach", () => {
    expect(slideDurationMs("lineup")).toBeGreaterThan(slideDurationMs("cover"));
    expect(slideDurationMs("cover")).toBeGreaterThanOrEqual(3000);
  });
});

describe("story gestures", () => {
  it("sends the left third back and the rest forward", () => {
    expect(resolveTapZone(10, 360)).toBe("previous");
    expect(resolveTapZone(119, 360)).toBe("previous");
    expect(resolveTapZone(121, 360)).toBe("next");
    expect(resolveTapZone(350, 360)).toBe("next");
    expect(resolveTapZone(10, 0)).toBe("next");
  });

  it("closes on a long or fast downward swipe only", () => {
    expect(shouldCloseOnSwipe(120, 0)).toBe(true);
    expect(shouldCloseOnSwipe(40, 1200)).toBe(true);
    expect(shouldCloseOnSwipe(40, 100)).toBe(false);
    expect(shouldCloseOnSwipe(10, 2000)).toBe(false);
    expect(shouldCloseOnSwipe(-200, -1500)).toBe(false);
  });

  it("runs the clock only while nothing pauses it", () => {
    const base = { appActive: true, screenFocused: true, externalPause: false, held: false };
    expect(isStoryRunning(base)).toBe(true);
    expect(isStoryRunning({ ...base, held: true })).toBe(false);
    expect(isStoryRunning({ ...base, appActive: false })).toBe(false);
    expect(isStoryRunning({ ...base, screenFocused: false })).toBe(false);
    expect(isStoryRunning({ ...base, externalPause: true })).toBe(false);
  });

  it("uses final frames for reduced motion and screen readers", () => {
    expect(usesStaticFrames(false, false)).toBe(false);
    expect(usesStaticFrames(true, false)).toBe(true);
    expect(usesStaticFrames(false, true)).toBe(true);
  });

  it("fills segments: past full, active live (full when static), rest empty", () => {
    expect(getSegmentFill(0, 2, false)).toBe("full");
    expect(getSegmentFill(2, 2, false)).toBe("live");
    expect(getSegmentFill(2, 2, true)).toBe("full");
    expect(getSegmentFill(3, 2, false)).toBe("empty");
  });
});

describe("storyReducer", () => {
  const start = createStoryState(4);

  it("steps forward and back", () => {
    const one = run(start, { type: "step", delta: 1 });
    expect(one.index).toBe(1);
    expect(one.gen).toBe(start.gen + 1);
    expect(run(one, { type: "step", delta: -1 }).index).toBe(0);
  });

  it("does not wrap: next on the last slide stays", () => {
    const last = run(start, { type: "jump", target: 3 });
    const after = run(last, { type: "step", delta: 1 });
    expect(after).toBe(last);
    expect(after.index).toBe(3);
  });

  it("restarts the first slide on previous", () => {
    const after = run(start, { type: "step", delta: -1 });
    expect(after.index).toBe(0);
    expect(after.gen).toBe(start.gen + 1);
    expect(after.ended).toBe(false);
  });

  it("jumps to a segment and ignores bad or same targets", () => {
    expect(run(start, { type: "jump", target: 2 }).index).toBe(2);
    expect(run(start, { type: "jump", target: 0 })).toBe(start);
    expect(run(start, { type: "jump", target: 4 })).toBe(start);
    expect(run(start, { type: "jump", target: -1 })).toBe(start);
    expect(run(start, { type: "jump", target: 1.5 })).toBe(start);
  });

  it("marks the end of the slide it belongs to, once", () => {
    const ended = run(start, { type: "slideEnd", gen: start.gen });
    expect(ended.ended).toBe(true);
    expect(run(ended, { type: "slideEnd", gen: start.gen })).toBe(ended);
  });

  it("ignores a stale end from a slide that was left", () => {
    const moved = run(start, { type: "step", delta: 1 });
    expect(run(moved, { type: "slideEnd", gen: start.gen })).toBe(moved);
  });

  it("auto-advances after the end, except off the last slide", () => {
    const ended = run(start, { type: "slideEnd", gen: start.gen });
    expect(shouldAutoAdvance(ended)).toBe(true);
    expect(shouldAutoAdvance(start)).toBe(false);
    const last = run(start, { type: "jump", target: 3 });
    const lastEnded = run(last, { type: "slideEnd", gen: last.gen });
    expect(lastEnded.ended).toBe(true);
    expect(shouldAutoAdvance(lastEnded)).toBe(false);
  });

  it("never auto-advances with static frames (reduced motion or screen reader)", () => {
    const fixed = run(start, { type: "setStatic", value: true });
    expect(fixed.staticFrames).toBe(true);
    expect(fixed.gen).toBe(start.gen + 1);
    const ended = run(fixed, { type: "slideEnd", gen: fixed.gen });
    expect(ended.ended).toBe(false);
    expect(shouldAutoAdvance(ended)).toBe(false);
    expect(run(fixed, { type: "setStatic", value: true })).toBe(fixed);
    expect(run(fixed, { type: "step", delta: 1 }).index).toBe(1);
  });

  it("holds position when there are no slides", () => {
    const empty = createStoryState(0);
    expect(run(empty, { type: "step", delta: 1 })).toBe(empty);
  });
});
