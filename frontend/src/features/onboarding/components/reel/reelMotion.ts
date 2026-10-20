/**
 * Worklet helpers for the reel's clock-driven animation. Every scene reads one shared "clock"
 * (ms since the scene started) and derives each element's progress from it, so pausing the
 * clock pauses the whole scene and the progress segment together.
 */

/** 0 before `start`, 1 after `end`, linear in between. */
export function seg(ms: number, start: number, end: number): number {
  "worklet";
  if (ms <= start) {
    return 0;
  }
  if (ms >= end) {
    return 1;
  }
  return (ms - start) / (end - start);
}

export function easeOut(p: number): number {
  "worklet";
  const q = 1 - p;
  return 1 - q * q * q;
}

export function easeIn(p: number): number {
  "worklet";
  return p * p * p;
}

export function easeInOut(p: number): number {
  "worklet";
  const q = -2 * p + 2;
  return p < 0.5 ? 4 * p * p * p : 1 - (q * q * q) / 2;
}

/** Overshoots slightly then settles: the clock-driven stand-in for `springs.bouncy`. */
export function easeOutBack(p: number): number {
  "worklet";
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const q = p - 1;
  return 1 + c3 * q * q * q + c1 * q * q;
}

export function lerp(from: number, to: number, p: number): number {
  "worklet";
  return from + (to - from) * p;
}
