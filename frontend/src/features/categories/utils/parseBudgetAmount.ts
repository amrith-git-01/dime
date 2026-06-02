/** Parse optional monthly budget text; returns positive amount or null if empty/invalid. */
export function parseBudgetAmount(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, "");
  if (!trimmed) {
    return null;
  }
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}
