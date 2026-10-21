import { resetMockMmkv } from "@/test-utils/mockMmkv";
import { setCelebrationsEnabled } from "@/lib/haptics/hapticPreferencesStorage";
import {
  triggerConfirmHaptic,
  triggerTickHaptic,
} from "@/lib/haptics/nativeHaptics";

import { useCelebrationStore } from "../celebrationStore";

jest.mock("react-native-mmkv", () =>
  jest.requireActual("@/test-utils/mockMmkv"),
);
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerConfirmHaptic: jest.fn(() => Promise.resolve()),
  triggerTickHaptic: jest.fn(() => Promise.resolve()),
}));

const store = () => useCelebrationStore.getState();

function setToday(year: number, monthIndex: number, day: number, hour = 12): void {
  jest.setSystemTime(new Date(year, monthIndex, day, hour, 0, 0));
}

describe("celebration store", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setToday(2026, 9, 15);
    resetMockMmkv();
    jest.clearAllMocks();
    useCelebrationStore.setState({
      event: null,
      reduceMotion: false,
      suppressed: false,
      primed: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("plays the full effect by default, at the requested point", () => {
    store().celebrate({ kind: "burst", at: { x: 200, y: 700 } });
    expect(store().event).toMatchObject({
      kind: "burst",
      mode: "particles",
      at: { x: 200, y: 700 },
    });
  });

  it("gives every effect its own id, and only clears the one that finished", () => {
    store().celebrate({ kind: "burst" });
    const first = store().event!.id;
    store().celebrate({ kind: "burst" });
    const second = store().event!.id;
    expect(second).not.toBe(first);

    store().clear(first);
    expect(store().event?.id).toBe(second);
    store().clear(second);
    expect(store().event).toBeNull();
  });

  describe("haptics", () => {
    it("confetti confirms, a burst ticks", () => {
      store().celebrate({ kind: "confetti" });
      expect(triggerConfirmHaptic).toHaveBeenCalledTimes(1);
      store().celebrate({ kind: "burst" });
      expect(triggerTickHaptic).toHaveBeenCalledTimes(1);
    });

    it("can be told the caller already gave feedback", () => {
      store().celebrate({ kind: "burst", haptic: false });
      expect(triggerTickHaptic).not.toHaveBeenCalled();
    });
  });

  describe("reduced motion", () => {
    beforeEach(() => store().setReduceMotion(true));

    it("shows a static check instead of particles, and still gives the haptic", () => {
      store().celebrate({ kind: "confetti" });
      expect(store().event).toMatchObject({ kind: "confetti", mode: "check" });
      expect(triggerConfirmHaptic).toHaveBeenCalledTimes(1);

      store().celebrate({ kind: "burst" });
      expect(store().event).toMatchObject({ kind: "burst", mode: "check" });
    });

    it("does not use up the day's big confetti", () => {
      store().celebrate({ kind: "confetti" });
      store().setReduceMotion(false);
      store().celebrate({ kind: "confetti" });
      expect(store().event?.mode).toBe("particles");
    });
  });

  describe("the Celebrations preference", () => {
    it("off: a static check and the haptic, no particles", () => {
      setCelebrationsEnabled(false);
      store().celebrate({ kind: "confetti" });
      expect(store().event).toMatchObject({ mode: "check" });
      expect(triggerConfirmHaptic).toHaveBeenCalledTimes(1);

      store().celebrate({ kind: "burst" });
      expect(store().event).toMatchObject({ mode: "check" });
    });

    it("is read every time, so turning it back on works at once", () => {
      setCelebrationsEnabled(false);
      store().celebrate({ kind: "burst" });
      expect(store().event?.mode).toBe("check");
      setCelebrationsEnabled(true);
      store().celebrate({ kind: "burst" });
      expect(store().event?.mode).toBe("particles");
    });
  });

  describe("a replayed tour", () => {
    it("celebrates nothing at all: no effect, no haptic", () => {
      store().setSuppressed(true);
      store().celebrate({ kind: "confetti" });
      store().celebrate({ kind: "burst", at: { x: 1, y: 1 } });
      expect(store().event).toBeNull();
      expect(triggerConfirmHaptic).not.toHaveBeenCalled();
      expect(triggerTickHaptic).not.toHaveBeenCalled();
    });

    it("does not use up the day's big confetti", () => {
      store().setSuppressed(true);
      store().celebrate({ kind: "confetti" });
      store().setSuppressed(false);
      store().celebrate({ kind: "confetti" });
      expect(store().event?.mode).toBe("particles");
    });
  });

  describe("big confetti at most once per local day", () => {
    it("the second one the same day is a static check (and the haptic), not confetti", () => {
      store().celebrate({ kind: "confetti" });
      expect(store().event?.mode).toBe("particles");

      setToday(2026, 9, 15, 23);
      store().celebrate({ kind: "confetti" });
      expect(store().event).toMatchObject({ kind: "confetti", mode: "check" });
      expect(triggerConfirmHaptic).toHaveBeenCalledTimes(2);
    });

    it("comes back the next local day", () => {
      store().celebrate({ kind: "confetti" });
      setToday(2026, 9, 16, 0);
      store().celebrate({ kind: "confetti" });
      expect(store().event?.mode).toBe("particles");
    });

    it("does not limit bursts", () => {
      store().celebrate({ kind: "confetti" });
      store().celebrate({ kind: "burst" });
      store().celebrate({ kind: "burst" });
      expect(store().event).toMatchObject({ kind: "burst", mode: "particles" });
    });
  });
  describe("the lighter confetti (a tour finished again, or after the day's big one)", () => {
    it("plays particles and confirms with a haptic", () => {
      store().celebrate({ kind: "confettiMedium" });
      expect(store().event).toMatchObject({ kind: "confettiMedium", mode: "particles" });
      expect(triggerConfirmHaptic).toHaveBeenCalledTimes(1);
    });

    it("never uses up the day's big confetti, and is not limited by it", () => {
      store().celebrate({ kind: "confettiMedium" });
      store().celebrate({ kind: "confettiMedium" });
      store().celebrate({ kind: "confetti" });
      expect(store().event).toMatchObject({ kind: "confetti", mode: "particles" });

      store().celebrate({ kind: "confettiMedium" });
      expect(store().event).toMatchObject({ kind: "confettiMedium", mode: "particles" });
    });

    it("is a static check with the haptic under reduced motion or with Celebrations off", () => {
      store().setReduceMotion(true);
      store().celebrate({ kind: "confettiMedium" });
      expect(store().event).toMatchObject({ mode: "check" });
      store().setReduceMotion(false);

      setCelebrationsEnabled(false);
      store().celebrate({ kind: "confettiMedium" });
      expect(store().event).toMatchObject({ mode: "check" });
    });

    it("is suppressed for a replayed first-run tour like everything else", () => {
      store().setSuppressed(true);
      store().celebrate({ kind: "confettiMedium" });
      expect(store().event).toBeNull();
    });
  });

  describe("when today's big confetti is used up", () => {
    it("can fall back to the lighter confetti instead of the static check", () => {
      store().celebrate({ kind: "confetti" });
      store().celebrate({ kind: "confetti", capFallback: "medium" });
      expect(store().event).toMatchObject({ kind: "confettiMedium", mode: "particles" });
    });

    it("the first one of the day is still the big one", () => {
      store().celebrate({ kind: "confetti", capFallback: "medium" });
      expect(store().event).toMatchObject({ kind: "confetti", mode: "particles" });
    });

    it("can be told to play regardless (the all-tours-done moment)", () => {
      store().celebrate({ kind: "confetti" });
      store().celebrate({ kind: "confetti", ignoreDailyCap: true });
      expect(store().event).toMatchObject({ kind: "confetti", mode: "particles" });
    });
  });

  describe("the particle canvas", () => {
    it("is asked for ahead of time (a tour starting), and stays asked for", () => {
      expect(store().primed).toBe(false);
      store().prime();
      expect(store().primed).toBe(true);
      store().celebrate({ kind: "burst" });
      store().clear(store().event!.id);
      expect(store().primed).toBe(true);
    });
  });
});
