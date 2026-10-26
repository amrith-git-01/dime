import type { TourStep } from "../constants/tourTypes";

/** Unique `enter` actions of both lists, in order. */
function mergeEnter(
  own: TourStep["enter"],
  inherited: TourStep["enter"],
): TourStep["enter"] {
  const merged = [...(own ?? []), ...(inherited ?? [])];
  const unique = merged.filter((action, i) => merged.indexOf(action) === i);
  return unique.length > 0 ? unique : undefined;
}

/**
 * Puts a tour's card steps in the order of the cards on screen.
 *
 * - Steps with a `cardId` are grouped by card (a card's steps keep their order); a step without
 *   one (a screen the tour opens from that card, e.g. "All the details") stays right after the
 *   card step it followed, so it moves with its card.
 * - Steps before the first card step (a welcome card), the `atEnd` steps (e.g. Arrange) and the
 *   finish card(s) at the end stay put.
 * - A card that is not in `order` goes last, in its original place among such cards.
 * - What the first step of the tour carries (`enter` actions such as closing the + menu, and
 *   `backExits`) belongs to whichever step now opens the tour.
 */
export function sortTourStepsByCardOrder(
  steps: readonly TourStep[],
  order: readonly string[],
): TourStep[] {
  const firstCard = steps.findIndex((step) => step.cardId !== undefined);
  if (firstCard === -1) {
    return [...steps];
  }
  let end = steps.length;
  while (end > firstCard && (steps[end - 1].kind === "finale" || steps[end - 1].atEnd)) {
    end -= 1;
  }

  type Group = { cardId: string; steps: TourStep[]; first: number };
  const groups: Group[] = [];
  let current: Group | null = null;
  for (let i = firstCard; i < end; i += 1) {
    const step = steps[i];
    if (step.cardId !== undefined) {
      current = groups.find((g) => g.cardId === step.cardId) ?? null;
      if (!current) {
        current = { cardId: step.cardId, steps: [], first: i };
        groups.push(current);
      }
    }
    current?.steps.push(step);
  }

  const rank = (cardId: string) => {
    const at = order.indexOf(cardId);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  const sorted = [...groups].sort(
    (a, b) => rank(a.cardId) - rank(b.cardId) || a.first - b.first,
  );

  const result = [
    ...steps.slice(0, firstCard),
    ...sorted.flatMap((group) => group.steps),
    ...steps.slice(end),
  ];

  const oldFirst = steps[0];
  const newFirst = result[0];
  if (newFirst !== oldFirst && (oldFirst.enter || oldFirst.backExits)) {
    const { enter, backExits, ...rest } = oldFirst;
    const oldFirstAt = result.indexOf(oldFirst);
    result[oldFirstAt] = rest as TourStep;
    result[0] = {
      ...newFirst,
      enter: mergeEnter(newFirst.enter, enter),
      backExits: backExits ?? newFirst.backExits,
    };
  }
  return result;
}
