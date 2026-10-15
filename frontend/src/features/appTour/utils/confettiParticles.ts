export type ConfettiParticle = {
  /** Horizontal velocity (px over the whole burst). */
  vx: number;
  /** Initial vertical velocity (negative is up). */
  vy: number;
  width: number;
  height: number;
  rotation: number;
  spin: number;
  /** Index into the palette the renderer picks from. */
  colorIndex: number;
};

/** Small deterministic PRNG (mulberry32): same seed, same burst, so it can be unit tested. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildConfettiParticles(
  count: number,
  paletteSize: number,
  seed = 7,
): ConfettiParticle[] {
  const random = createRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    // Fan upwards: angle between -150deg and -30deg, with a little spread in speed.
    const angle = (-150 + random() * 120) * (Math.PI / 180);
    const speed = 280 + random() * 170;
    return {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      width: 5 + random() * 5,
      height: 8 + random() * 7,
      rotation: random() * Math.PI * 2,
      spin: (random() - 0.5) * 12,
      colorIndex: index % Math.max(1, paletteSize),
    };
  });
}

/** Gravity pull (px) over the whole burst. */
export const CONFETTI_GRAVITY = 300;
export const CONFETTI_DURATION_MS = 1300;

/** Offset of a particle from the burst origin at progress `t` (0..1). */
export function confettiOffset(
  particle: Pick<ConfettiParticle, "vx" | "vy">,
  t: number,
): { dx: number; dy: number } {
  "worklet";
  return {
    dx: particle.vx * t,
    dy: particle.vy * t + CONFETTI_GRAVITY * t * t,
  };
}
