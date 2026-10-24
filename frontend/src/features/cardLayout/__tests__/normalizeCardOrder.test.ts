import {
  BUDGETS_CARD_IDS,
  DEFAULT_CARD_ORDER,
  HOME_CARD_IDS,
  INSIGHTS_CARD_IDS,
  mergeCardLayouts,
  sanitizeCardLayouts,
} from "../cardIds";
import { CARD_META } from "../cardMeta";
import {
  normalizeCardOrder,
  orderToSave,
  sameOrder,
} from "../normalizeCardOrder";

const D = ["a", "b", "c", "d", "e"] as const;

describe("normalizeCardOrder", () => {
  it("is the default order when nothing is saved", () => {
    expect(normalizeCardOrder(undefined, D)).toEqual([...D]);
    expect(normalizeCardOrder(null, D)).toEqual([...D]);
    expect(normalizeCardOrder([], D)).toEqual([...D]);
  });

  it("returns a copy, never the defaults array itself", () => {
    const out = normalizeCardOrder(undefined, D);
    expect(out).not.toBe(D);
  });

  it("keeps a complete saved order as it is", () => {
    expect(normalizeCardOrder(["e", "d", "c", "b", "a"], D)).toEqual([
      "e",
      "d",
      "c",
      "b",
      "a",
    ]);
  });

  it("drops unknown ids", () => {
    expect(normalizeCardOrder(["c", "zzz", "a", "b", "d", "e"], D)).toEqual([
      "c",
      "a",
      "b",
      "d",
      "e",
    ]);
  });

  it("keeps the first occurrence of a duplicate", () => {
    expect(normalizeCardOrder(["c", "a", "c", "b", "a", "d", "e"], D)).toEqual([
      "c",
      "a",
      "b",
      "d",
      "e",
    ]);
  });

  it("inserts a missing id right after its nearest preceding default neighbour", () => {
    // "c" is new: its default predecessor "b" is in the saved order at index 2.
    expect(normalizeCardOrder(["e", "a", "b", "d"], D)).toEqual([
      "e",
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("falls back to the next earlier neighbour when the nearest one is missing too", () => {
    // "c" and "d" are new; "c" goes after "b", then "d" after "c".
    expect(normalizeCardOrder(["b", "e", "a"], D)).toEqual([
      "b",
      "c",
      "d",
      "e",
      "a",
    ]);
  });

  it("puts a new first card at the start", () => {
    expect(normalizeCardOrder(["c", "b", "e", "d"], D)).toEqual([
      "a",
      "c",
      "b",
      "e",
      "d",
    ]);
  });

  it("puts several new leading cards at the start, in default order, and the rest after their neighbours", () => {
    expect(normalizeCardOrder(["e", "c"], D)).toEqual(["a", "b", "e", "c", "d"]);
  });

  it("inserts a new last card after the card that precedes it by default, wherever that is", () => {
    expect(normalizeCardOrder(["d", "a", "c", "b"], D)).toEqual([
      "d",
      "e",
      "a",
      "c",
      "b",
    ]);
  });

  it("copes with a saved order of only unknown ids", () => {
    expect(normalizeCardOrder(["x", "y"], D)).toEqual([...D]);
  });

  it("always returns every default id exactly once", () => {
    const saved = ["d", "x", "d", "b", "q"];
    const out = normalizeCardOrder(saved, D);
    expect([...out].sort()).toEqual([...D]);
  });

  it("works on the real screens", () => {
    expect(
      normalizeCardOrder(
        ["home.recent", "home.month", "home.stats", "home.upcoming", "home.categories"],
        HOME_CARD_IDS,
      ),
    ).toEqual([
      "home.recent",
      "home.month",
      "home.getStarted",
      "home.stats",
      "home.upcoming",
      "home.categories",
    ]);
  });
});

describe("sameOrder / orderToSave", () => {
  it("compares ids in order", () => {
    expect(sameOrder(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameOrder(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameOrder(["a"], ["a", "b"])).toBe(false);
  });

  it("saves nothing special for the default order (an empty list resets it on the server)", () => {
    expect(orderToSave(D, D)).toEqual([]);
    expect(orderToSave(["b", "a", "c", "d", "e"], D)).toEqual(["b", "a", "c", "d", "e"]);
  });
});

describe("card ids", () => {
  it("default orders match today's screens", () => {
    expect(DEFAULT_CARD_ORDER.home).toEqual([
      "home.month",
      "home.getStarted",
      "home.stats",
      "home.upcoming",
      "home.categories",
      "home.recent",
    ]);
    expect(DEFAULT_CARD_ORDER.budgets).toEqual(BUDGETS_CARD_IDS);
    expect(DEFAULT_CARD_ORDER.insights).toEqual(INSIGHTS_CARD_IDS);
  });

  it("every card has a name and an icon, and ids are unique and server-safe", () => {
    const all = [...HOME_CARD_IDS, ...BUDGETS_CARD_IDS, ...INSIGHTS_CARD_IDS];
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) {
      expect(id).toMatch(/^[a-z][a-zA-Z0-9_.-]{0,47}$/);
      expect(CARD_META[id].name.length).toBeGreaterThan(0);
      expect(CARD_META[id].icon).toBeDefined();
    }
    expect(Object.keys(CARD_META).sort()).toEqual([...all].sort());
  });
});

describe("sanitizeCardLayouts", () => {
  it("keeps known screens with non-empty string lists", () => {
    expect(
      sanitizeCardLayouts({ home: ["a"], budgets: [], insights: ["x", "y"], other: ["z"] }),
    ).toEqual({ home: ["a"], insights: ["x", "y"] });
  });

  it("reads anything else as nothing saved", () => {
    for (const value of [null, undefined, 3, "x", [], { home: "a" }, { home: [1] }]) {
      expect(sanitizeCardLayouts(value)).toEqual({});
    }
  });
});

describe("mergeCardLayouts", () => {
  it("merges per screen and leaves the others alone", () => {
    expect(mergeCardLayouts({ home: ["a"], budgets: ["b"] }, { home: ["c"] })).toEqual({
      home: ["c"],
      budgets: ["b"],
    });
  });

  it("an empty list removes the screen's saved order", () => {
    expect(mergeCardLayouts({ home: ["a"], budgets: ["b"] }, { home: [] })).toEqual({
      budgets: ["b"],
    });
  });

  it("does not change its inputs and handles missing ones", () => {
    const current = { home: ["a"] };
    mergeCardLayouts(current, { home: [] });
    expect(current).toEqual({ home: ["a"] });
    expect(mergeCardLayouts(undefined, undefined)).toEqual({});
    expect(mergeCardLayouts(undefined, { insights: ["i"] })).toEqual({ insights: ["i"] });
  });
});
