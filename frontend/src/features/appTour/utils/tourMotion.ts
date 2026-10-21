export type TourMotion = {
  /** The spotlight glides between targets with springs; otherwise it cross-fades (no travel). */
  spring: boolean;
  /** Breathing glow ring around the hole. */
  pulse: boolean;
  /** Sparkle trail along the hole's path, and the welcome mark's twinkle. */
  sparkle: boolean;
  /** Duration of opacity fades (ms); kept even when everything else is off. */
  fadeMs: number;
  /** The card fades out this long (ms) before the hole moves on. */
  cardOutMs: number;
  /** The card fades in this long (ms) once the hole has settled. */
  cardInMs: number;
  /** How far (dp) the card slides in from the target's side; 0 = fade only. */
  cardSlideDp: number;
  /** Delay (ms) between the title and the body appearing. */
  textStaggerMs: number;
  /** How long (ms) the hole needs to land before the card appears. */
  holeSettleMs: number;
  /** Ripples at the target when a "Do" step succeeds, and the zoom-through when the tour changes screen. */
  ripple: boolean;
  /** The step title appears word by word. */
  wordFade: boolean;
  /** Delay (ms) between one title word and the next. */
  wordStaggerMs: number;
  /** How long (ms) the "Nice!" check holds before the next step's card appears. */
  niceHoldMs: number;
};

const FADE_MS = 180;

/** Timings of the ripple that marks a completed "Do" step and the larger one on a screen change. */
export const TOUR_RIPPLE = {
  /** The small ripple at the target (ms). */
  doneMs: 560,
  /** The wide zoom-through ring when the tour moves to another screen (ms). */
  warpMs: 440,
} as const;

/** Timings of the sparkle trail that follows the hole between targets. */
export const TOUR_SPARKLE_TRAIL = {
  count: 8,
  /** The hole's travel time the sparkles are spread across (ms). */
  travelMs: 420,
  /** Each sparkle fades within this long after the hole passed it (ms). */
  fadeMs: 500,
  /** Travel shorter than this (dp) is not worth a trail. */
  minDistance: 48,
} as const;

/** Motion budget for the tour. With reduced motion only opacity fades remain. */
export function getTourMotion(reduceMotion: boolean): TourMotion {
  if (reduceMotion) {
    return {
      spring: false,
      pulse: false,
      sparkle: false,
      fadeMs: FADE_MS,
      cardOutMs: 120,
      cardInMs: FADE_MS,
      cardSlideDp: 0,
      textStaggerMs: 0,
      holeSettleMs: FADE_MS,
      ripple: false,
      wordFade: false,
      wordStaggerMs: 0,
      niceHoldMs: 520,
    };
  }
  return {
    spring: true,
    pulse: true,
    sparkle: true,
    fadeMs: FADE_MS,
    cardOutMs: 120,
    cardInMs: 200,
    cardSlideDp: 10,
    textStaggerMs: 60,
    holeSettleMs: 340,
    ripple: true,
    wordFade: true,
    wordStaggerMs: 55,
    niceHoldMs: 640,
  };
}
