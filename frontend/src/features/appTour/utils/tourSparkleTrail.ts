import { createRandom } from "@/lib/celebrations/particles";

import { TOUR_SPARKLE_TRAIL } from "./tourMotion";

export type TourSparkleSeed = {
  /** Where along the hole's travel time (0..1) this sparkle is left behind. */
  birth: number;
  /** Sideways offset from the path (dp). */
  jitter: number;
  /** Tip radius (dp). */
  size: number;
};

export type TourSparkleFrame = { x: number; y: number; radius: number };

export function buildTourSparkleSeeds(
  count: number = TOUR_SPARKLE_TRAIL.count,
  seed = 5,
): TourSparkleSeed[] {
  const random = createRandom(seed);
  return Array.from({ length: count }, (_, index) => ({
    birth: (index + 1) / (count + 1),
    jitter: (random() - 0.5) * 30,
    size: 4.5 + random() * 3.5,
  }));
}

/**
 * One sparkle of the trail at `clockMs` after the hole started moving from `from` to `to`:
 * dropped where the hole was at its birth time, then drifting and shrinking away within
 * `TOUR_SPARKLE_TRAIL.fadeMs`. Radius 0 means it is not visible. Runs on the UI thread.
 */
export function sparkleTrailFrame(
  seed: TourSparkleSeed,
  clockMs: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
): TourSparkleFrame {
  "worklet";
  const age = clockMs - seed.birth * TOUR_SPARKLE_TRAIL.travelMs;
  if (age < 0 || age >= TOUR_SPARKLE_TRAIL.fadeMs) {
    return { x: 0, y: 0, radius: 0 };
  }
  const life = age / TOUR_SPARKLE_TRAIL.fadeMs;
  // The hole eases out as it lands, so later sparkles sit closer together near the target.
  const along = 1 - Math.pow(1 - seed.birth, 3);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const sideways = seed.jitter * (0.4 + life * 0.6);
  return {
    x: from.x + dx * along - (dy / length) * sideways,
    y: from.y + dy * along + (dx / length) * sideways + life * 8,
    radius: seed.size * (1 - life),
  };
}
