/** True when both lists hold the same ids in the same order. */
export function sameOrder(
  a: readonly string[],
  b: readonly string[],
): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * Turns a saved order into the order to render, given the screen's default order (`defaults`).
 *
 * - Saved ids that are known keep their saved order; unknown ids (a card removed in an update) are dropped.
 * - Duplicates keep their first occurrence.
 * - A known id missing from the saved order (a card added in an update) is inserted right after
 *   its nearest preceding neighbour in the default order that is present, or at the start when
 *   none is.
 * - Nothing saved (undefined or empty) means the default order.
 */
export function normalizeCardOrder<T extends string>(
  saved: readonly string[] | null | undefined,
  defaults: readonly T[],
): T[] {
  if (!saved || saved.length === 0) {
    return [...defaults];
  }
  const known = new Set<string>(defaults);
  const result: T[] = [];
  const seen = new Set<string>();
  for (const id of saved) {
    if (known.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id as T);
    }
  }
  // Missing ids are handled in default order, so a run of new cards keeps its own order.
  defaults.forEach((id, defaultIndex) => {
    if (seen.has(id)) {
      return;
    }
    let insertAt = 0;
    for (let i = defaultIndex - 1; i >= 0; i -= 1) {
      const at = result.indexOf(defaults[i]);
      if (at !== -1) {
        insertAt = at + 1;
        break;
      }
    }
    result.splice(insertAt, 0, id);
    seen.add(id);
  });
  return result;
}

/** What to save: nothing special when the order is the default (the server drops the screen's key). */
export function orderToSave(
  order: readonly string[],
  defaults: readonly string[],
): string[] {
  return sameOrder(order, defaults) ? [] : [...order];
}
