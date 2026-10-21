import { getTourMotion, TOUR_RIPPLE, TOUR_SPARKLE_TRAIL } from "../tourMotion";
import {
  buildTourSparkleSeeds,
  sparkleTrailFrame,
} from "../tourSparkleTrail";

describe("getTourMotion", () => {
  it("allows every flourish by default", () => {
    expect(getTourMotion(false)).toMatchObject({
      spring: true,
      pulse: true,
      sparkle: true,
      cardOutMs: 120,
      cardInMs: 200,
      textStaggerMs: 60,
    });
    expect(getTourMotion(false).cardSlideDp).toBeGreaterThanOrEqual(8);
    expect(getTourMotion(false).cardSlideDp).toBeLessThanOrEqual(12);
  });

  it("with reduced motion drops springs, pulse, sparkles and the slide but keeps fades", () => {
    const motion = getTourMotion(true);
    expect(motion.spring).toBe(false);
    expect(motion.pulse).toBe(false);
    expect(motion.sparkle).toBe(false);
    expect(motion.cardSlideDp).toBe(0);
    expect(motion.textStaggerMs).toBe(0);
    expect(motion.fadeMs).toBeGreaterThan(0);
    expect(motion.cardInMs).toBeGreaterThan(0);
  });

  it("allows the ripples, the word-by-word title and the Nice! hold by default", () => {
    expect(getTourMotion(false)).toMatchObject({ ripple: true, wordFade: true });
    expect(getTourMotion(false).wordStaggerMs).toBeGreaterThan(0);
    expect(getTourMotion(false).niceHoldMs).toBeGreaterThanOrEqual(500);
    expect(TOUR_RIPPLE.doneMs).toBeLessThanOrEqual(700);
    expect(TOUR_RIPPLE.warpMs).toBeLessThanOrEqual(500);
  });

  it("with reduced motion has no ripples and no word-by-word title, but still holds the Nice! check", () => {
    const motion = getTourMotion(true);
    expect(motion.ripple).toBe(false);
    expect(motion.wordFade).toBe(false);
    expect(motion.wordStaggerMs).toBe(0);
    expect(motion.niceHoldMs).toBeGreaterThan(0);
  });
});

describe("sparkle trail", () => {
  const from = { x: 0, y: 0 };
  const to = { x: 300, y: 0 };

  it("makes the configured number of seeds, spread across the travel time", () => {
    const seeds = buildTourSparkleSeeds();
    expect(seeds).toHaveLength(TOUR_SPARKLE_TRAIL.count);
    expect(TOUR_SPARKLE_TRAIL.count).toBeGreaterThanOrEqual(6);
    expect(TOUR_SPARKLE_TRAIL.count).toBeLessThanOrEqual(10);
    for (const seed of seeds) {
      expect(seed.birth).toBeGreaterThan(0);
      expect(seed.birth).toBeLessThan(1);
    }
    expect(buildTourSparkleSeeds()).toEqual(seeds);
  });

  it("shows a sparkle only between its birth and its fade-out", () => {
    const [seed] = buildTourSparkleSeeds();
    const bornAt = seed.birth * TOUR_SPARKLE_TRAIL.travelMs;
    expect(sparkleTrailFrame(seed, bornAt - 1, from, to).radius).toBe(0);
    expect(sparkleTrailFrame(seed, bornAt + 10, from, to).radius).toBeGreaterThan(0);
    expect(
      sparkleTrailFrame(seed, bornAt + TOUR_SPARKLE_TRAIL.fadeMs + 1, from, to)
        .radius,
    ).toBe(0);
  });

  it("fades out within about half a second of the hole passing", () => {
    expect(TOUR_SPARKLE_TRAIL.fadeMs).toBeLessThanOrEqual(500);
  });

  it("leaves sparkles along the way from the old target to the new one", () => {
    for (const seed of buildTourSparkleSeeds()) {
      const bornAt = seed.birth * TOUR_SPARKLE_TRAIL.travelMs;
      const frame = sparkleTrailFrame(seed, bornAt + 1, from, to);
      expect(frame.x).toBeGreaterThan(0);
      expect(frame.x).toBeLessThan(to.x);
    }
  });
});
