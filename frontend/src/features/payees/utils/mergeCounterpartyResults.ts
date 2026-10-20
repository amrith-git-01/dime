import type { BrandSuggestion, PayeeSuggestion } from "../types";

export type MergeCaps = {
  maxYours: number;
  maxBrands: number;
  /** Upper bound on yours + brands together (defaults to no extra bound). */
  maxTotal?: number;
};

export const DEFAULT_MERGE_CAPS: MergeCaps = { maxYours: 4, maxBrands: 6 };

export type MergedCounterpartyResults = {
  yours: PayeeSuggestion[];
  brands: BrandSuggestion[];
  /** The trimmed typed text. */
  typedText: string;
  /** Offer `Use "<typedText>"`: text is typed and no shown result is exactly it (ignoring case). */
  showUseTyped: boolean;
};

/**
 * Orders the results of the counterparty search box: the user's own payees first, then catalogue brands that are
 * not already among them (same brand id), each section capped.
 */
export function mergeCounterpartyResults(
  yours: readonly PayeeSuggestion[],
  brands: readonly BrandSuggestion[],
  typedText: string,
  caps: MergeCaps = DEFAULT_MERGE_CAPS,
): MergedCounterpartyResults {
  const text = typedText.trim();
  const shownYours = yours.slice(0, caps.maxYours);
  const ownBrandIds = new Set(
    yours.flatMap((payee) => (payee.brand_id ? [payee.brand_id] : [])),
  );
  const brandRoom = Math.max(
    0,
    Math.min(caps.maxBrands, (caps.maxTotal ?? Infinity) - shownYours.length),
  );
  const shownBrands = brands
    .filter((brand) => !ownBrandIds.has(brand.id))
    .slice(0, brandRoom);
  const lower = text.toLowerCase();
  const exact = [...shownYours, ...shownBrands].some(
    (result) => result.name.trim().toLowerCase() === lower,
  );
  return {
    yours: shownYours,
    brands: shownBrands,
    typedText: text,
    showUseTyped: text.length > 0 && !exact,
  };
}
