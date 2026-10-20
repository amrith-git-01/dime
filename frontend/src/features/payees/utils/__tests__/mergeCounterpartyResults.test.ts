import type { BrandSuggestion, PayeeSuggestion } from "../../types";
import { mergeCounterpartyResults } from "../mergeCounterpartyResults";

const payee = (name: string, brandId: string | null = null): PayeeSuggestion => ({
  name,
  brand_id: brandId,
  domain: null,
  counterparty_type: "merchant",
  category: null,
  count: 1,
  last_at: "2026-10-01T00:00:00.000Z",
});

const brand = (id: string, name: string): BrandSuggestion => ({
  id,
  name,
  domain: null,
  logo_url: null,
  category: null,
});

describe("mergeCounterpartyResults", () => {
  it("lists own payees first, then brands the user does not already have", () => {
    const result = mergeCounterpartyResults(
      [payee("Swiggy", "wd:swiggy"), payee("Ravi")],
      [brand("wd:swiggy", "Swiggy"), brand("wd:swiss", "Swiss Air")],
      "sw",
    );
    expect(result.yours.map((p) => p.name)).toEqual(["Swiggy", "Ravi"]);
    expect(result.brands.map((b) => b.id)).toEqual(["wd:swiss"]);
    expect(result.typedText).toBe("sw");
    expect(result.showUseTyped).toBe(true);
  });

  it("caps each section (4 yours, 6 brands by default)", () => {
    const yours = Array.from({ length: 7 }, (_, i) => payee(`Own ${i}`));
    const brands = Array.from({ length: 9 }, (_, i) => brand(`b${i}`, `Brand ${i}`));
    const result = mergeCounterpartyResults(yours, brands, "o");
    expect(result.yours).toHaveLength(4);
    expect(result.brands).toHaveLength(6);
  });

  it("honours a total cap, giving own payees the room first", () => {
    const yours = [payee("A1"), payee("A2"), payee("A3")];
    const brands = [brand("b1", "B1"), brand("b2", "B2"), brand("b3", "B3")];
    const result = mergeCounterpartyResults(yours, brands, "a", {
      maxYours: 4,
      maxBrands: 4,
      maxTotal: 4,
    });
    expect(result.yours).toHaveLength(3);
    expect(result.brands.map((b) => b.id)).toEqual(["b1"]);
    const none = mergeCounterpartyResults([], [], "a", { maxYours: 4, maxBrands: 4, maxTotal: 0 });
    expect(none.brands).toEqual([]);
  });

  it("hides the use-as-typed row for an exact match of a shown result, ignoring case and padding", () => {
    expect(
      mergeCounterpartyResults([payee("Swiggy")], [], "  SWIGGY ").showUseTyped,
    ).toBe(false);
    expect(
      mergeCounterpartyResults([], [brand("b", "Blinkit")], "blinkit").showUseTyped,
    ).toBe(false);
    expect(
      mergeCounterpartyResults([payee("Swiggy")], [], "Swigg").showUseTyped,
    ).toBe(true);
  });

  it("offers nothing to use when no text is typed", () => {
    const result = mergeCounterpartyResults([payee("Swiggy")], [], "   ");
    expect(result.showUseTyped).toBe(false);
    expect(result.typedText).toBe("");
  });

  it("does not hide use-as-typed because of a result cut off by the caps", () => {
    const yours = [payee("A"), payee("B"), payee("Exact")];
    const result = mergeCounterpartyResults(yours, [], "Exact", { maxYours: 2, maxBrands: 6 });
    expect(result.showUseTyped).toBe(true);
  });
});
