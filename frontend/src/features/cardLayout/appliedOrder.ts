import type { CardScreen } from "./cardIds";

/**
 * The order each screen is showing right now. The guided tour reads it when it starts, so its
 * steps follow what the user sees (a layout change from another device is held back while the
 * screen is open, so the saved order and the shown order can differ for a while).
 */
const applied = new Map<CardScreen, readonly string[]>();

export function setAppliedCardOrder(
  screen: CardScreen,
  order: readonly string[],
): void {
  applied.set(screen, order);
}

export function getAppliedCardOrder(
  screen: CardScreen,
): readonly string[] | undefined {
  return applied.get(screen);
}

export function clearAppliedCardOrders(): void {
  applied.clear();
}
