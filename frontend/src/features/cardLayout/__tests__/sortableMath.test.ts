import {
  clampDragOffset,
  moveInOrder,
  orderFromSlots,
  reorderSlots,
  slotsFromOrder,
  SORT_ROW_HEIGHT,
  targetIndexFromOffset,
} from "../sortableMath";

const H = SORT_ROW_HEIGHT;

describe("targetIndexFromOffset", () => {
  it("rounds the dragged row's top to the nearest slot", () => {
    expect(targetIndexFromOffset(0, H, 5)).toBe(0);
    expect(targetIndexFromOffset(H * 0.49, H, 5)).toBe(0);
    expect(targetIndexFromOffset(H * 0.5, H, 5)).toBe(1);
    expect(targetIndexFromOffset(H * 2.2, H, 5)).toBe(2);
    expect(targetIndexFromOffset(H * 3, H, 5)).toBe(3);
  });

  it("clamps to the first and last slot", () => {
    expect(targetIndexFromOffset(-500, H, 5)).toBe(0);
    expect(targetIndexFromOffset(H * 50, H, 5)).toBe(4);
  });

  it("copes with an empty list", () => {
    expect(targetIndexFromOffset(100, H, 0)).toBe(0);
  });

  it("is at least 56 high per row", () => {
    expect(SORT_ROW_HEIGHT).toBeGreaterThanOrEqual(56);
  });
});

describe("clampDragOffset", () => {
  it("keeps the row inside the list", () => {
    expect(clampDragOffset(-20, H, 4)).toBe(0);
    expect(clampDragOffset(H * 1.5, H, 4)).toBe(H * 1.5);
    expect(clampDragOffset(H * 10, H, 4)).toBe(H * 3);
    expect(clampDragOffset(30, H, 0)).toBe(0);
  });
});

describe("reorderSlots", () => {
  // Item k sits in slot slots[k]; start with the identity.
  const identity = [0, 1, 2, 3, 4];

  it("moving down shifts the rows it passes up by one", () => {
    expect(reorderSlots(identity, 1, 3)).toEqual([0, 3, 1, 2, 4]);
  });

  it("moving up shifts the rows it passes down by one", () => {
    expect(reorderSlots(identity, 3, 1)).toEqual([0, 2, 3, 1, 4]);
  });

  it("moving to the same slot changes nothing", () => {
    expect(reorderSlots(identity, 2, 2)).toEqual(identity);
  });

  it("works from a shuffled state and always stays a permutation", () => {
    let slots = [2, 0, 4, 1, 3];
    for (const [item, to] of [[0, 4], [3, 0], [4, 2], [1, 1], [2, 3]] as const) {
      slots = reorderSlots(slots, item, to);
      expect(slots[item]).toBe(to);
      expect([...slots].sort()).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it("does not change its input", () => {
    const slots = [0, 1, 2];
    reorderSlots(slots, 0, 2);
    expect(slots).toEqual([0, 1, 2]);
  });
});

describe("slots and order", () => {
  const base = ["a", "b", "c", "d"];

  it("slotsFromOrder gives each fixed item its position in the order", () => {
    expect(slotsFromOrder(base, ["c", "a", "d", "b"])).toEqual([1, 3, 0, 2]);
  });

  it("orderFromSlots is its inverse", () => {
    const order = ["c", "a", "d", "b"];
    expect(orderFromSlots(base, slotsFromOrder(base, order))).toEqual(order);
  });

  it("a dragged row ends up where the maths says", () => {
    let slots = slotsFromOrder(base, base);
    // Drag "a" from the top to just past "c".
    slots = reorderSlots(slots, 0, targetIndexFromOffset(H * 2.1, H, 4));
    expect(orderFromSlots(base, slots)).toEqual(["b", "c", "a", "d"]);
  });
});

describe("moveInOrder", () => {
  it("moves one place up or down", () => {
    expect(moveInOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });

  it("stays put at the ends and for unknown ids", () => {
    expect(moveInOrder(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveInOrder(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(moveInOrder(["a", "b", "c"], "zzz", 1)).toEqual(["a", "b", "c"]);
  });
});
