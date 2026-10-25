/**
 * Pure maths of the sortable Arrange list. Rows have one fixed height, so a row's position is
 * `slot * rowHeight`. Slots are numbers (not ids) so everything here can run as a worklet on the
 * UI thread while a row is dragged.
 */

/** Height of one row; position = slot * SORT_ROW_HEIGHT. At least 56 so every row is a comfortable target. */
export const SORT_ROW_HEIGHT = 56;

/** The slot a dragged row sits over: its top offset rounded to the nearest row, kept inside the list. */
export function targetIndexFromOffset(
  offsetY: number,
  rowHeight: number,
  count: number,
): number {
  "worklet";
  if (count <= 0) {
    return 0;
  }
  const raw = Math.round(offsetY / rowHeight);
  return Math.max(0, Math.min(count - 1, raw));
}

/** Where a dragged row may be: from the first slot to the last, never outside the list. */
export function clampDragOffset(
  offsetY: number,
  rowHeight: number,
  count: number,
): number {
  "worklet";
  return Math.max(0, Math.min(Math.max(0, count - 1) * rowHeight, offsetY));
}

/**
 * `slots[k]` is the slot item `k` is in. Moves `item` to slot `to`; the items it passes shift by
 * one to make room. Returns a new array (the input is not changed).
 */
export function reorderSlots(
  slots: readonly number[],
  item: number,
  to: number,
): number[] {
  "worklet";
  const from = slots[item];
  const next: number[] = [];
  for (let k = 0; k < slots.length; k += 1) {
    const slot = slots[k];
    if (k === item) {
      next.push(to);
    } else if (from < to && slot > from && slot <= to) {
      next.push(slot - 1);
    } else if (from > to && slot >= to && slot < from) {
      next.push(slot + 1);
    } else {
      next.push(slot);
    }
  }
  return next;
}

/** Slots of `base` ids (a fixed list) for a given order: `slots[k]` = position of `base[k]` in `order`. */
export function slotsFromOrder(
  base: readonly string[],
  order: readonly string[],
): number[] {
  return base.map((id, k) => {
    const at = order.indexOf(id);
    return at === -1 ? k : at;
  });
}

/** The inverse of `slotsFromOrder`: ids of `base` in slot order. */
export function orderFromSlots(
  base: readonly string[],
  slots: readonly number[],
): string[] {
  const out: string[] = new Array<string>(base.length);
  base.forEach((id, k) => {
    out[slots[k]] = id;
  });
  return out;
}

/** `order` with `id` moved one place up (delta -1) or down (+1); unchanged at the ends. */
export function moveInOrder(
  order: readonly string[],
  id: string,
  delta: -1 | 1,
): string[] {
  const from = order.indexOf(id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= order.length) {
    return [...order];
  }
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** `activeKey` value while no row is held. */
export const NO_ACTIVE_ROW = -1;

/**
 * Whether a touch may lift a row now: only while no row is held. A second finger on another row
 * (or on the same row's other grip) is ignored instead of taking over the drag.
 */
export function canLiftRow(activeKey: number): boolean {
  "worklet";
  return activeKey === NO_ACTIVE_ROW;
}
