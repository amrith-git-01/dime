import { useCallback, useEffect, useState } from "react";

import { ArrangeButton } from "@/components/layout/ArrangeButton";
import { useAppTourStore } from "@/features/appTour/store/appTourStore";

import type { CardIdOf, CardScreen } from "../cardIds";
import { CARD_SCREEN_TITLES } from "../cardMeta";
import type { CardOrderState } from "../hooks/useCardOrder";
import { sameOrder } from "../normalizeCardOrder";

import { ArrangeSheet } from "./ArrangeSheet";

export type ArrangeCardsProps<S extends CardScreen> = {
  screen: S;
  cardOrder: CardOrderState<S>;
};

/**
 * The "Arrange" button for the end of a screen plus the sheet it opens. Done hands the new order
 * to `cardOrder.commit` (applied now, saved in the background). Starting a guided tour closes it.
 */
export function ArrangeCards<S extends CardScreen>({
  screen,
  cardOrder,
}: ArrangeCardsProps<S>) {
  const [open, setOpen] = useState(false);
  // A new sheet (state and all) for each opening; none is mounted until the first one.
  const [sessions, setSessions] = useState(0);
  const tourActive = useAppTourStore((state) => state.active);
  const { order, commit } = cardOrder;

  useEffect(() => {
    if (tourActive) {
      setOpen(false);
    }
  }, [tourActive]);

  const onOpen = useCallback(() => {
    setSessions((count) => count + 1);
    setOpen(true);
  }, []);
  const onCancel = useCallback(() => setOpen(false), []);
  const onDone = useCallback(
    (next: string[]) => {
      setOpen(false);
      if (!sameOrder(next, order)) {
        commit(next as CardIdOf<S>[]);
      }
    },
    [commit, order],
  );

  return (
    <>
      <ArrangeButton
        onPress={onOpen}
        accessibilityLabel={CARD_SCREEN_TITLES[screen]}
      />
      {sessions > 0 ? (
        <ArrangeSheet
          key={sessions}
          visible={open}
          screen={screen}
          order={order}
          onCancel={onCancel}
          onDone={onDone}
        />
      ) : null}
    </>
  );
}
