import {
  buildConfettiParticles,
  confettiOffset,
} from "../confettiParticles";
import { getTourMotion } from "../tourMotion";

describe("getTourMotion", () => {
  it("allows every flourish by default", () => {
    expect(getTourMotion(false)).toEqual({
      spring: true,
      pulse: true,
      confetti: true,
      sparkle: true,
      fadeMs: expect.any(Number),
    });
  });

  it("with reduced motion drops springs, pulse, confetti and sparkle but keeps fades", () => {
    const motion = getTourMotion(true);
    expect(motion.spring).toBe(false);
    expect(motion.pulse).toBe(false);
    expect(motion.confetti).toBe(false);
    expect(motion.sparkle).toBe(false);
    expect(motion.fadeMs).toBeGreaterThan(0);
  });
});

describe("confetti particles", () => {
  it("is deterministic for a seed and varies between seeds", () => {
    expect(buildConfettiParticles(20, 6, 1)).toEqual(
      buildConfettiParticles(20, 6, 1),
    );
    expect(buildConfettiParticles(20, 6, 1)).not.toEqual(
      buildConfettiParticles(20, 6, 2),
    );
  });

  it("builds the requested count, all launched upwards, with valid palette indexes", () => {
    const particles = buildConfettiParticles(40, 6);
    expect(particles).toHaveLength(40);
    for (const particle of particles) {
      expect(particle.vy).toBeLessThan(0);
      expect(particle.colorIndex).toBeGreaterThanOrEqual(0);
      expect(particle.colorIndex).toBeLessThan(6);
    }
  });

  it("starts at the origin, rises, and is pulled down by gravity", () => {
    const [particle] = buildConfettiParticles(1, 1);
    const atStart = confettiOffset(particle, 0);
    expect(Math.abs(atStart.dx)).toBe(0);
    expect(Math.abs(atStart.dy)).toBe(0);
    expect(confettiOffset(particle, 0.25).dy).toBeLessThan(0);
    // Without gravity the particle would end at exactly `vy`.
    expect(confettiOffset(particle, 1).dy).toBeGreaterThan(particle.vy);
  });
});
