export type CelebrationParticle = {
  /** Where it starts, in layer coordinates (px). */
  x0: number;
  y0: number;
  /** Velocity in px over the whole effect (negative `vy` is up). */
  vx: number;
  vy: number;
  /** Extra downward pull in px over the whole effect. */
  gravity: number;
  /** Rectangle width, or coin diameter (px). */
  size: number;
  /** Rectangle height as a multiple of its width (ignored for coins). */
  aspect: number;
  rotation: number;
  /** Total rotation over the whole effect (radians). */
  spin: number;
  /** Side-to-side wobble: amplitude (px) and cycles over the effect. */
  swayAmp: number;
  swayCycles: number;
  swayPhase: number;
  /** Fraction of the effect to wait before this particle appears (0..1). */
  delay: number;
  /** Index into the palette the renderer picks from (rectangles only). */
  colorIndex: number;
  shape: "rect" | "coin";
};

export type CelebrationKind = "confetti" | "burst";

/** How long each effect plays (ms). */
export const CELEBRATION_DURATION_MS: Record<CelebrationKind, number> = {
  confetti: 2200,
  burst: 750,
};

export const CONFETTI_PARTICLE_COUNT = 112;
export const BURST_PARTICLE_COUNT = 22;
/** Share of confetti drawn as ₹ coins (gold rings) instead of paper. */
const COIN_SHARE = 0.18;

/** Small deterministic PRNG (mulberry32): same seed, same burst, so it can be unit tested. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type BuildConfettiOptions = {
  count?: number;
  paletteSize: number;
  /** The layer the confetti covers (px). */
  width: number;
  height: number;
  /** A point to fire from, fanning upwards; without one the confetti rains from the top edge. */
  origin?: { x: number; y: number };
  seed?: number;
};

/** Big confetti: paper and coins that fall with gravity and a little wobble, then fade. */
export function buildConfettiParticles({
  count = CONFETTI_PARTICLE_COUNT,
  paletteSize,
  width,
  height,
  origin,
  seed = 7,
}: BuildConfettiOptions): CelebrationParticle[] {
  const random = createRandom(seed);
  const colors = Math.max(1, paletteSize);
  return Array.from({ length: count }, (_, index) => {
    const isCoin = random() < COIN_SHARE;
    const shared = {
      rotation: random() * Math.PI * 2,
      spin: (random() - 0.5) * 14,
      swayAmp: 6 + random() * 14,
      swayCycles: 1 + random() * 2,
      swayPhase: random() * Math.PI * 2,
      colorIndex: index % colors,
      shape: isCoin ? ("coin" as const) : ("rect" as const),
      size: isCoin ? 9 + random() * 4 : 5 + random() * 5,
      aspect: isCoin ? 1 : 1.4 + random() * 0.8,
    };

    if (origin) {
      // Fan upwards: angle between -150deg and -30deg, with a little spread in speed.
      const angle = (-150 + random() * 120) * (Math.PI / 180);
      const speed = 280 + random() * 170;
      return {
        ...shared,
        x0: origin.x,
        y0: origin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 520,
        delay: random() * 0.1,
      };
    }

    return {
      ...shared,
      x0: random() * width,
      y0: -16 - random() * 60,
      vx: (random() - 0.5) * 90,
      vy: 40 + random() * 140,
      // Enough pull to carry most pieces past the bottom edge before they fade.
      gravity: height * (0.85 + random() * 0.3),
      delay: random() * 0.3,
    };
  });
}

export type BuildBurstOptions = {
  count?: number;
  paletteSize: number;
  origin: { x: number; y: number };
  seed?: number;
};

/** A small radial burst: pieces fly out from one point, slow down under gravity and fade. */
export function buildBurstParticles({
  count = BURST_PARTICLE_COUNT,
  paletteSize,
  origin,
  seed = 11,
}: BuildBurstOptions): CelebrationParticle[] {
  const random = createRandom(seed);
  const colors = Math.max(1, paletteSize);
  return Array.from({ length: count }, (_, index) => {
    const angle = ((index + random() * 0.8) / count) * Math.PI * 2;
    const speed = 70 + random() * 70;
    const isCoin = index % 4 === 0;
    return {
      x0: origin.x,
      y0: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 30,
      size: isCoin ? 7 + random() * 3 : 4 + random() * 3,
      aspect: isCoin ? 1 : 1.3 + random() * 0.6,
      rotation: random() * Math.PI * 2,
      spin: (random() - 0.5) * 8,
      swayAmp: 0,
      swayCycles: 0,
      swayPhase: 0,
      delay: 0,
      colorIndex: index % colors,
      shape: isCoin ? ("coin" as const) : ("rect" as const),
    };
  });
}

export type ParticleFrame = {
  x: number;
  y: number;
  angle: number;
  /** 0 while waiting to appear and once faded; pieces shrink away instead of fading individually. */
  scale: number;
};

/** Fraction of a particle's own run after which it starts to shrink away. */
const SHRINK_START = 0.7;

/** Where a particle is at overall progress `t` (0..1); runs on the UI thread. */
export function particleFrame(
  particle: CelebrationParticle,
  t: number,
): ParticleFrame {
  "worklet";
  const span = 1 - particle.delay;
  const u = span > 0 ? (t - particle.delay) / span : 1;
  if (u <= 0 || u >= 1) {
    return { x: particle.x0, y: particle.y0, angle: 0, scale: 0 };
  }
  const sway =
    particle.swayAmp *
    Math.sin(particle.swayPhase + u * particle.swayCycles * Math.PI * 2);
  return {
    x: particle.x0 + particle.vx * u + sway,
    y: particle.y0 + particle.vy * u + particle.gravity * u * u,
    angle: particle.rotation + particle.spin * u,
    scale: u < SHRINK_START ? 1 : 1 - (u - SHRINK_START) / (1 - SHRINK_START),
  };
}
