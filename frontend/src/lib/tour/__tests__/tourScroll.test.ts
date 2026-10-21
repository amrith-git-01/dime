import { registerTourCommand, runTourCommand } from "../tourCommandRegistry";
import { emitTourEvent, subscribeTourEvents } from "../tourEvents";
import { revealTourTargetOnce } from "../tourReveal";
import {
  computeRevealOffset,
  getTourScroller,
  registerTourScroller,
  TOUR_REVEAL_MARGIN,
} from "../tourScrollRegistry";
import { registerTourTarget } from "../tourTargetRegistry";

/** A fake native view whose window rect the test controls. */
function fakeView(rect: () => [number, number, number, number]) {
  return {
    current: {
      measureInWindow: (callback: (x: number, y: number, w: number, h: number) => void) =>
        callback(...rect()),
    },
  } as never;
}

describe("computeRevealOffset", () => {
  const band = { viewportTop: 100, viewportBottom: 700 };

  it("leaves a target that is fully in view alone", () => {
    expect(
      computeRevealOffset({ targetY: 200, targetHeight: 100, currentOffset: 40, ...band }),
    ).toBeNull();
  });

  it("scrolls forward so a target below the fold sits just under the top of the visible band", () => {
    const next = computeRevealOffset({
      targetY: 900,
      targetHeight: 120,
      currentOffset: 0,
      ...band,
    });
    expect(next).toBe(900 - (100 + TOUR_REVEAL_MARGIN));
  });

  it("scrolls back up to a target above the visible band", () => {
    const next = computeRevealOffset({
      targetY: -300,
      targetHeight: 120,
      currentOffset: 800,
      ...band,
    });
    expect(next).toBe(800 + (-300 - (100 + TOUR_REVEAL_MARGIN)));
  });

  it("brings in a target that is only partly visible (behind the tab bar)", () => {
    const next = computeRevealOffset({
      targetY: 650,
      targetHeight: 120,
      currentOffset: 100,
      ...band,
    });
    expect(next).not.toBeNull();
    expect(next).toBeGreaterThan(100);
  });

  it("never scrolls above the top of the content", () => {
    const next = computeRevealOffset({
      targetY: -50,
      targetHeight: 80,
      currentOffset: 20,
      ...band,
    });
    expect(next).toBe(0);
  });

  it("counts a target taller than the band as in view once its top is", () => {
    expect(
      computeRevealOffset({ targetY: 110, targetHeight: 900, currentOffset: 0, ...band }),
    ).toBeNull();
  });

  it("gives up when the list cannot scroll any further", () => {
    expect(
      computeRevealOffset({ targetY: 120, targetHeight: 900, currentOffset: 0, ...band }),
    ).toBeNull();
    expect(
      computeRevealOffset({ targetY: -2, targetHeight: 50, currentOffset: 0, viewportTop: 0, viewportBottom: 600 }),
    ).toBeNull();
  });
});

describe("scroller registry", () => {
  it("registers a screen's scroller and unregisters it, but only its own", () => {
    const first = { scrollTo: jest.fn(), getOffset: () => 0 };
    const second = { scrollTo: jest.fn(), getOffset: () => 0 };
    const unregisterFirst = registerTourScroller("home", first);
    expect(getTourScroller("home")).toBe(first);
    const unregisterSecond = registerTourScroller("home", second);
    unregisterFirst();
    expect(getTourScroller("home")).toBe(second);
    unregisterSecond();
    expect(getTourScroller("home")).toBeUndefined();
  });
});

describe("revealTourTargetOnce (scroll a target into view)", () => {
  const request = {
    scrollKey: "budgets" as const,
    windowHeight: 800,
    bottomReserved: 100,
    fallbackTop: 90,
  };
  const cleanups: (() => void)[] = [];
  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
  });

  it("scrolls the screen's list towards a target below the fold and says where", async () => {
    const scrollTo = jest.fn();
    cleanups.push(registerTourScroller("budgets", { scrollTo, getOffset: () => 50 }));
    cleanups.push(registerTourTarget("t.below", fakeView(() => [0, 1200, 300, 100])));
    const requested = await revealTourTargetOnce({ ...request, targetId: "t.below" });
    expect(requested).toBe(50 + (1200 - (90 + TOUR_REVEAL_MARGIN)));
    expect(scrollTo).toHaveBeenCalledWith(requested, true);
  });

  it("does nothing for a target already in view", async () => {
    const scrollTo = jest.fn();
    cleanups.push(registerTourScroller("budgets", { scrollTo, getOffset: () => 0 }));
    cleanups.push(registerTourTarget("t.visible", fakeView(() => [0, 300, 300, 100])));
    expect(await revealTourTargetOnce({ ...request, targetId: "t.visible" })).toBeNull();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls a target that sits behind the floating buttons, near the bottom of the screen", async () => {
    const scrollTo = jest.fn();
    cleanups.push(registerTourScroller("budgets", { scrollTo, getOffset: () => 0 }));
    // Above the tab bar (700) but within 120 dp of it: hidden behind the buttons.
    cleanups.push(registerTourTarget("t.low", fakeView(() => [0, 610, 300, 60])));
    const requested = await revealTourTargetOnce({ ...request, targetId: "t.low" });
    expect(requested).toBe(610 - (90 + TOUR_REVEAL_MARGIN));
  });

  it("uses the app header to know where the scrollable area starts", async () => {
    const scrollTo = jest.fn();
    cleanups.push(registerTourScroller("budgets", { scrollTo, getOffset: () => 0 }));
    cleanups.push(registerTourTarget("app.header", fakeView(() => [0, 0, 400, 180])));
    cleanups.push(registerTourTarget("t.top", fakeView(() => [0, 120, 300, 100])));
    // The header ends at 180, so a target at 120 is hidden behind it.
    const requested = await revealTourTargetOnce({ ...request, targetId: "t.top" });
    expect(requested).toBeNull(); // cannot scroll above the top of the content
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("falls back to the anchor when the target itself is not mounted (a list row beyond the draw distance)", async () => {
    const scrollTo = jest.fn();
    cleanups.push(registerTourScroller("budgets", { scrollTo, getOffset: () => 0 }));
    cleanups.push(registerTourTarget("t.anchor", fakeView(() => [0, 1500, 300, 60])));
    const requested = await revealTourTargetOnce({
      ...request,
      targetId: "t.missing",
      anchorId: "t.anchor",
    });
    expect(requested).toBe(1500 - (90 + TOUR_REVEAL_MARGIN));
  });

  it("does nothing when nothing is registered for the screen or the target is not there", async () => {
    expect(await revealTourTargetOnce({ ...request, targetId: "t.none" })).toBeNull();
    cleanups.push(registerTourScroller("budgets", { scrollTo: jest.fn(), getOffset: () => 0 }));
    expect(await revealTourTargetOnce({ ...request, targetId: "t.none" })).toBeNull();
  });
});

describe("tour commands", () => {
  it("runs a registered command and says so, and says no when there is none", () => {
    const run = jest.fn();
    const unregister = registerTourCommand("test.command", run);
    expect(runTourCommand("test.command")).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    unregister();
    expect(runTourCommand("test.command")).toBe(false);
    expect(runTourCommand("test.unknown")).toBe(false);
  });

  it("keeps the newest registration for a name, and the older one's cleanup does not remove it", () => {
    const first = jest.fn();
    const second = jest.fn();
    const unregisterFirst = registerTourCommand("test.shared", first);
    const unregisterSecond = registerTourCommand("test.shared", second);
    unregisterFirst();
    runTourCommand("test.shared");
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    unregisterSecond();
  });
});

describe("tour events", () => {
  it("reach subscribers until they unsubscribe, and cost nothing with none", () => {
    expect(() => emitTourEvent("nobody.listening")).not.toThrow();
    const listener = jest.fn();
    const unsubscribe = subscribeTourEvents(listener);
    emitTourEvent("daySelected", { day: "2026-10-01" });
    expect(listener).toHaveBeenCalledWith("daySelected", { day: "2026-10-01" });
    unsubscribe();
    emitTourEvent("daySelected");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
