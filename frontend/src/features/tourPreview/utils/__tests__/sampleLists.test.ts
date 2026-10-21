import { buildSampleSet } from "../buildSampleMonth";
import {
  filterSamplePages,
  sampleRowMatchesFilters,
  sampleRowsInRange,
} from "../sampleLists";

const TZ = "Asia/Kolkata";
const set = buildSampleSet({ today: new Date(2026, 9, 15), timezone: TZ });
const rows = set.current.monthPages.pages[0].items;

describe("sampleRowMatchesFilters", () => {
  const zomato = rows.find((row) => row.merchant === "Zomato");

  it("matches everything with no filters", () => {
    expect(rows.every((row) => sampleRowMatchesFilters(row, undefined))).toBe(true);
    expect(rows.every((row) => sampleRowMatchesFilters(row, {}))).toBe(true);
  });

  it("matches a payee by case-insensitive contains, like the server", () => {
    expect(zomato).toBeDefined();
    expect(sampleRowMatchesFilters(zomato!, { payee: "zom" })).toBe(true);
    expect(sampleRowMatchesFilters(zomato!, { payee: "ZOMATO" })).toBe(true);
    expect(sampleRowMatchesFilters(zomato!, { payee: "swiggy" })).toBe(false);
  });

  it("matches a category by id", () => {
    expect(sampleRowMatchesFilters(zomato!, { categoryId: zomato!.category_id ?? "" })).toBe(true);
    expect(sampleRowMatchesFilters(zomato!, { categoryId: "other-category" })).toBe(false);
  });
});

describe("filterSamplePages", () => {
  it("returns the pages themselves when there is nothing to filter", () => {
    expect(filterSamplePages(set.current.monthPages, undefined)).toBe(set.current.monthPages);
    expect(filterSamplePages(set.current.monthPages, {})).toBe(set.current.monthPages);
  });

  it("narrows by category and by payee, in one page without more to load", () => {
    const food = rows.find((row) => row.category === "Food & Dining")!;
    const byCategory = filterSamplePages(set.current.monthPages, { categoryId: food.category_id! });
    expect(byCategory.pages).toHaveLength(1);
    expect(byCategory.pages[0].has_more).toBe(false);
    expect(byCategory.pages[0].items.length).toBeGreaterThan(1);
    expect(byCategory.pages[0].items.every((row) => row.category === "Food & Dining")).toBe(true);

    const byPayee = filterSamplePages(set.current.monthPages, { payee: "uber" });
    expect(byPayee.pages[0].items.map((row) => row.merchant)).toEqual(["Uber", "Uber", "Uber"]);
  });
});

describe("sampleRowsInRange", () => {
  const from = new Date(2026, 9, 14).toISOString();
  const to = new Date(2026, 9, 15).toISOString();

  it("takes the rows inside the half-open range, newest first, as one page", () => {
    const { data, past } = sampleRowsInRange(set, from, to, undefined);
    const items = data.pages[0].items;
    expect(items.length).toBeGreaterThan(0);
    expect(past).toBe(false);
    for (const row of items) {
      expect(row.transaction_at >= from).toBe(true);
      expect(row.transaction_at < to).toBe(true);
    }
    expect(items.map((row) => row.transaction_at)).toEqual(
      [...items.map((row) => row.transaction_at)].sort().reverse(),
    );
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0].has_more).toBe(false);
  });

  it("applies the filters too", () => {
    const month = sampleRowsInRange(
      set,
      new Date(2026, 9, 1).toISOString(),
      new Date(2026, 10, 1).toISOString(),
      { payee: "swiggy" },
    );
    expect(month.data.pages[0].items.every((row) => row.merchant === "Swiggy")).toBe(true);
    expect(month.data.pages[0].items.length).toBeGreaterThan(0);
  });

  it("flags rows that come from last month", () => {
    const range = sampleRowsInRange(
      set,
      new Date(2026, 8, 1).toISOString(),
      new Date(2026, 10, 1).toISOString(),
      undefined,
    );
    expect(range.past).toBe(true);
    expect(range.data.pages[0].items.length).toBe(
      rows.length + set.previous.monthPages.pages[0].items.length,
    );
  });

  it("is empty for a range the sample does not cover, and for a bad range", () => {
    expect(
      sampleRowsInRange(set, new Date(2025, 0, 1).toISOString(), new Date(2025, 1, 1).toISOString(), undefined)
        .data.pages[0].items,
    ).toEqual([]);
    expect(sampleRowsInRange(set, "", "", undefined).data.pages[0].items).toEqual([]);
  });
});
