import {
  SPLASH_MIN_DISPLAY_MS,
  SPLASH_SHELL_TIMEOUT_MS,
} from "@/constants/splash";

import { computeSplashRevealDelayMs } from "../splashRevealDelay";

describe("splash timing", () => {
  it("shows the splash for at least 0.8 s and caps a broken start at 8 s", () => {
    expect(SPLASH_MIN_DISPLAY_MS).toBe(800);
    expect(SPLASH_SHELL_TIMEOUT_MS).toBe(8000);
  });
});

describe("computeSplashRevealDelayMs", () => {
  it("releases after the minimum display time once everything is ready", () => {
    expect(computeSplashRevealDelayMs({ now: 100, splashStartedAt: 0, ready: true })).toBe(
      SPLASH_MIN_DISPLAY_MS - 100,
    );
  });

  it("releases at once when the minimum has already passed", () => {
    expect(
      computeSplashRevealDelayMs({ now: SPLASH_MIN_DISPLAY_MS + 50, splashStartedAt: 0, ready: true }),
    ).toBe(0);
  });

  it("waits for the cap, counted from the same start as the minimum, when not ready", () => {
    expect(computeSplashRevealDelayMs({ now: 1000, splashStartedAt: 0, ready: false })).toBe(
      SPLASH_SHELL_TIMEOUT_MS - 1000,
    );
  });

  it("does not release a slow start at the old 2 s mark", () => {
    expect(
      computeSplashRevealDelayMs({ now: 2000, splashStartedAt: 0, ready: false }),
    ).toBeGreaterThan(0);
  });

  it("never lets the total splash time pass the cap, however late the timer is armed", () => {
    for (const now of [0, 300, 900, 1500, 7999]) {
      const total = now + computeSplashRevealDelayMs({ now, splashStartedAt: 0, ready: false });
      expect(total).toBe(SPLASH_SHELL_TIMEOUT_MS);
    }
  });

  it("a gate that never opens is released at the cap, not held", () => {
    expect(computeSplashRevealDelayMs({ now: 0, splashStartedAt: 0, ready: false })).toBe(
      SPLASH_SHELL_TIMEOUT_MS,
    );
  });
});
