import {
  collapsedHole,
  computeBlockerRects,
  computeSpotlightHole,
} from "../tourSpotlight";

const screen = { width: 390, height: 844 };

describe("computeSpotlightHole", () => {
  it("grows the target by the padding and uses the requested corner radius", () => {
    const hole = computeSpotlightHole(
      { x: 20, y: 100, width: 350, height: 160 },
      { padding: 6, shape: "rounded", radius: 32, screen },
    );
    expect(hole).toEqual({ x: 14, y: 94, width: 362, height: 172, radius: 32 });
  });

  it("never lets the radius exceed half the shorter side", () => {
    const hole = computeSpotlightHole(
      { x: 20, y: 100, width: 100, height: 20 },
      { padding: 0, shape: "rounded", radius: 32, screen },
    );
    expect(hole.radius).toBe(10);
  });

  it("makes a true circle around the center for circle shapes", () => {
    const hole = computeSpotlightHole(
      { x: 100, y: 700, width: 60, height: 44 },
      { padding: 10, shape: "circle", screen },
    );
    expect(hole.width).toBe(hole.height);
    expect(hole.radius).toBe(hole.width / 2);
    expect(hole.x + hole.width / 2).toBeCloseTo(130, 5);
    expect(hole.y + hole.height / 2).toBeCloseTo(722, 5);
  });

  it("rounds a pill fully", () => {
    const hole = computeSpotlightHole(
      { x: 80, y: 300, width: 70, height: 26 },
      { padding: 8, shape: "pill", screen },
    );
    expect(hole.radius).toBe(hole.height / 2);
  });

  it("keeps the hole inside the screen", () => {
    const hole = computeSpotlightHole(
      { x: 2, y: 2, width: 400, height: 860 },
      { padding: 10, shape: "rounded", screen },
    );
    expect(hole.x).toBeGreaterThanOrEqual(0);
    expect(hole.y).toBeGreaterThanOrEqual(0);
    expect(hole.x + hole.width).toBeLessThanOrEqual(screen.width);
    expect(hole.y + hole.height).toBeLessThanOrEqual(screen.height);
  });
});

describe("collapsedHole", () => {
  it("is an empty hole at the given point", () => {
    expect(collapsedHole({ x: 195, y: 422 })).toEqual({
      x: 195,
      y: 422,
      width: 0,
      height: 0,
      radius: 0,
    });
  });
});

describe("computeBlockerRects", () => {
  const hole = { x: 100, y: 300, width: 80, height: 60 };
  const blockers = computeBlockerRects(hole, screen);

  it("returns four rects", () => {
    expect(blockers).toHaveLength(4);
  });

  it("covers every pixel outside the hole exactly once", () => {
    const area = blockers.reduce((sum, r) => sum + r.width * r.height, 0);
    expect(area).toBe(
      screen.width * screen.height - hole.width * hole.height,
    );
  });

  it("leaves the hole itself uncovered", () => {
    const centerX = hole.x + hole.width / 2;
    const centerY = hole.y + hole.height / 2;
    const covers = (r: { x: number; y: number; width: number; height: number }) =>
      centerX >= r.x &&
      centerX <= r.x + r.width &&
      centerY >= r.y &&
      centerY <= r.y + r.height &&
      r.width > 0 &&
      r.height > 0;
    expect(blockers.some(covers)).toBe(false);
  });

  it("never returns negative sizes when the hole touches an edge", () => {
    const edge = computeBlockerRects(
      { x: 0, y: 0, width: screen.width, height: 100 },
      screen,
    );
    for (const rect of edge) {
      expect(rect.width).toBeGreaterThanOrEqual(0);
      expect(rect.height).toBeGreaterThanOrEqual(0);
    }
  });
});
