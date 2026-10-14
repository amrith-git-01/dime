export type TourMotion = {
  /** Spotlight and card glide between steps with springs; otherwise they jump and fade. */
  spring: boolean;
  /** Breathing glow ring around the hole. */
  pulse: boolean;
  /** Confetti burst on the finale. */
  confetti: boolean;
  /** Welcome sparkle spins and twinkles. */
  sparkle: boolean;
  /** Duration of opacity fades (ms); kept even when everything else is off. */
  fadeMs: number;
};

const FADE_MS = 180;

/** Motion budget for the tour. With reduced motion only opacity fades remain. */
export function getTourMotion(reduceMotion: boolean): TourMotion {
  if (reduceMotion) {
    return {
      spring: false,
      pulse: false,
      confetti: false,
      sparkle: false,
      fadeMs: FADE_MS,
    };
  }
  return {
    spring: true,
    pulse: true,
    confetti: true,
    sparkle: true,
    fadeMs: FADE_MS,
  };
}
