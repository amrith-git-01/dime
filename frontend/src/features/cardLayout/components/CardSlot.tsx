import { createContext, useContext, useLayoutEffect } from "react";

/** Set by the wrapper of a card in `OrderedCards`; null when a card is rendered on its own. */
export const CardSlotContext = createContext<((empty: boolean) => void) | null>(
  null,
);

/**
 * A card that can render nothing in some states (Get started once retired, Upcoming with no
 * items) tells its slot, so the slot takes no space: the screen's `gap` would otherwise leave an
 * empty hole where the card is not. Call it before any early return.
 */
export function useCardSlotEmpty(empty: boolean): void {
  const report = useContext(CardSlotContext);
  useLayoutEffect(() => {
    report?.(empty);
    return () => report?.(false);
  }, [report, empty]);
}
