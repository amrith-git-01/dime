import {
  BURST_PARTICLE_COUNT,
  buildBurstParticles,
  buildConfettiParticles,
  CELEBRATION_DURATION_MS,
  CONFETTI_PARTICLE_COUNT,
  particleFrame,
} from "../particles";

const SCREEN = { width: 400, height: 800 };

describe("confetti particles", () => {
  it("is deterministic for a seed and varies between seeds", () => {
    const options = { paletteSize: 6, ...SCREEN };
    expect(buildConfettiParticles({ ...options, seed: 1 })).toEqual(
      buildConfettiParticles({ ...options, seed: 1 }),
    );
    expect(buildConfettiParticles({ ...options, seed: 1 })).not.toEqual(
      buildConfettiParticles({ ...options, seed: 2 }),
    );
  });

  it("makes about a hundred pieces, some of them coins, with valid palette indexes", () => {
    const particles = buildConfettiParticles({ paletteSize: 6, ...SCREEN });
    expect(particles).toHaveLength(CONFETTI_PARTICLE_COUNT);
    expect(CONFETTI_PARTICLE_COUNT).toBeGreaterThanOrEqual(100);
    expect(CONFETTI_PARTICLE_COUNT).toBeLessThanOrEqual(120);
    expect(particles.some((p) => p.shape === "coin")).toBe(true);
    expect(particles.some((p) => p.shape === "rect")).toBe(true);
    for (const particle of particles) {
      expect(particle.colorIndex).toBeGreaterThanOrEqual(0);
      expect(particle.colorIndex).toBeLessThan(6);
    }
  });

  it("rains from above the top edge across the whole width when there is no origin", () => {
    const particles = buildConfettiParticles({ paletteSize: 6, ...SCREEN });
    for (const particle of particles) {
      expect(particle.y0).toBeLessThan(0);
      expect(particle.x0).toBeGreaterThanOrEqual(0);
      expect(particle.x0).toBeLessThanOrEqual(SCREEN.width);
    }
    const xs = particles.map((p) => p.x0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(SCREEN.width / 2);
  });

  it("fires upwards from a given origin", () => {
    const origin = { x: 200, y: 700 };
    const particles = buildConfettiParticles({
      paletteSize: 6,
      ...SCREEN,
      origin,
    });
    for (const particle of particles) {
      expect(particle.x0).toBe(origin.x);
      expect(particle.y0).toBe(origin.y);
      expect(particle.vy).toBeLessThan(0);
    }
  });

  it("plays for 1.5 to 2.5 seconds", () => {
    expect(CELEBRATION_DURATION_MS.confetti).toBeGreaterThanOrEqual(1500);
    expect(CELEBRATION_DURATION_MS.confetti).toBeLessThanOrEqual(2500);
  });
});

describe("burst particles", () => {
  const origin = { x: 200, y: 700 };

  it("makes about two dozen pieces that all start at the origin", () => {
    const particles = buildBurstParticles({ paletteSize: 6, origin });
    expect(particles).toHaveLength(BURST_PARTICLE_COUNT);
    expect(BURST_PARTICLE_COUNT).toBeGreaterThanOrEqual(20);
    expect(BURST_PARTICLE_COUNT).toBeLessThanOrEqual(24);
    for (const particle of particles) {
      expect(particle.x0).toBe(origin.x);
      expect(particle.y0).toBe(origin.y);
    }
  });

  it("radiates in every direction", () => {
    const particles = buildBurstParticles({ paletteSize: 6, origin });
    expect(particles.some((p) => p.vx > 0)).toBe(true);
    expect(particles.some((p) => p.vx < 0)).toBe(true);
    expect(particles.some((p) => p.vy > 0)).toBe(true);
    expect(particles.some((p) => p.vy < 0)).toBe(true);
  });

  it("plays for 600 to 900 ms", () => {
    expect(CELEBRATION_DURATION_MS.burst).toBeGreaterThanOrEqual(600);
    expect(CELEBRATION_DURATION_MS.burst).toBeLessThanOrEqual(900);
  });
});

describe("particleFrame", () => {
  it("starts at the origin, travels, and is pulled down by gravity", () => {
    const [particle] = buildConfettiParticles({
      count: 1,
      paletteSize: 1,
      ...SCREEN,
      origin: { x: 100, y: 500 },
    });
    const early = particleFrame({ ...particle, delay: 0 }, 0.01);
    expect(Math.abs(early.x - 100)).toBeLessThan(10);
    const mid = particleFrame({ ...particle, delay: 0 }, 0.5);
    // Without gravity it would be exactly y0 + vy * 0.5.
    expect(mid.y).toBeGreaterThan(500 + particle.vy * 0.5);
  });

  it("is hidden before its delay and once it has faded", () => {
    const [particle] = buildConfettiParticles({
      count: 1,
      paletteSize: 1,
      ...SCREEN,
    });
    const delayed = { ...particle, delay: 0.3 };
    expect(particleFrame(delayed, 0.1).scale).toBe(0);
    expect(particleFrame(delayed, 0.5).scale).toBe(1);
    expect(particleFrame(delayed, 1).scale).toBe(0);
  });

  it("shrinks away at the end of its run", () => {
    const [particle] = buildBurstParticles({
      count: 1,
      paletteSize: 1,
      origin: { x: 0, y: 0 },
    });
    const early = particleFrame(particle, 0.3).scale;
    const late = particleFrame(particle, 0.9).scale;
    expect(early).toBe(1);
    expect(late).toBeGreaterThan(0);
    expect(late).toBeLessThan(1);
  });
});
