import {
  SPLASH_MIN_DISPLAY_MS,
  SPLASH_SHELL_TIMEOUT_MS,
} from "@/constants/splash";

/**
 * How much longer the branded splash stays up. `ready` is bootstrap AND the first screen's shell
 * both done: then only the minimum display time is left. Otherwise the splash waits for the
 * safety cap, so a broken start (a gate or shell that never reports) cannot hold it forever. The
 * minimum and the cap are both measured from `splashStartedAt`, so the splash never outlasts
 * `SPLASH_SHELL_TIMEOUT_MS` in total.
 */
export function computeSplashRevealDelayMs(input: {
  now: number;
  /** When the splash first showed (JS start). */
  splashStartedAt: number;
  ready: boolean;
}): number {
  const { now, splashStartedAt, ready } = input;
  const elapsed = now - splashStartedAt;
  const minRemaining = Math.max(0, SPLASH_MIN_DISPLAY_MS - elapsed);
  if (ready) {
    return minRemaining;
  }
  return Math.max(minRemaining, Math.max(0, SPLASH_SHELL_TIMEOUT_MS - elapsed));
}
