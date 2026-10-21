import type { TourRect } from "@/lib/tour/tourTargetRegistry";

import type { TourPlacementPreference } from "../constants/tourTypes";

export type TourInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type TourCardSide = "above" | "below" | "center" | "overlay";

export type TourCardPlacement = {
  left: number;
  top: number;
  /**
   * `above` / `below`: the card sits beside the target with an arrow. `center`: no target.
   * `overlay`: the target is too tall for either side, so the card overlaps it (no arrow).
   */
  side: TourCardSide;
  /** Arrow tip x relative to the card's left edge; null when there is no arrow. */
  arrowX: number | null;
};

export type ComputeTourCardPlacementInput = {
  target: TourRect | null;
  card: { width: number; height: number };
  screen: { width: number; height: number };
  insets: TourInsets;
  preferred?: TourPlacementPreference;
};

/** Distance between the target and the card, which the arrow bridges. */
export const TOUR_CARD_GAP = 16;
/** Minimum distance from the screen / safe-area edge. */
export const TOUR_CARD_MARGIN = 16;
/** Keeps the arrow clear of the card's rounded corners. */
export const TOUR_ARROW_EDGE_INSET = 28;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Where the tooltip card goes: beside the target (above or below, whichever has room, honouring
 * the step's preference), always inside the safe area; centered when there is no target.
 */
export function computeTourCardPlacement({
  target,
  card,
  screen,
  insets,
  preferred = "auto",
}: ComputeTourCardPlacementInput): TourCardPlacement {
  const minTop = insets.top + TOUR_CARD_MARGIN;
  const maxBottom = screen.height - insets.bottom - TOUR_CARD_MARGIN;
  const centeredLeft = (screen.width - card.width) / 2;

  if (!target) {
    return {
      left: centeredLeft,
      top: clamp(
        minTop + (maxBottom - minTop - card.height) / 2,
        minTop,
        maxBottom - card.height,
      ),
      side: "center",
      arrowX: null,
    };
  }

  const left = clamp(
    target.x + target.width / 2 - card.width / 2,
    TOUR_CARD_MARGIN,
    screen.width - card.width - TOUR_CARD_MARGIN,
  );
  const targetCenterX = target.x + target.width / 2;
  const arrowX = clamp(
    targetCenterX - left,
    TOUR_ARROW_EDGE_INSET,
    card.width - TOUR_ARROW_EDGE_INSET,
  );

  const spaceAbove = target.y - TOUR_CARD_GAP - minTop;
  const spaceBelow = maxBottom - (target.y + target.height + TOUR_CARD_GAP);
  const fitsAbove = spaceAbove >= card.height;
  const fitsBelow = spaceBelow >= card.height;

  let side: "above" | "below" | null = null;
  if (preferred === "above" && fitsAbove) {
    side = "above";
  } else if (preferred === "below" && fitsBelow) {
    side = "below";
  } else if (fitsBelow && fitsAbove) {
    side = spaceBelow >= spaceAbove ? "below" : "above";
  } else if (fitsBelow) {
    side = "below";
  } else if (fitsAbove) {
    side = "above";
  }

  if (side === "above") {
    return {
      left,
      top: target.y - TOUR_CARD_GAP - card.height,
      side,
      arrowX,
    };
  }
  if (side === "below") {
    return {
      left,
      top: target.y + target.height + TOUR_CARD_GAP,
      side,
      arrowX,
    };
  }

  // Neither side has room (a very tall target): overlap it from the roomier edge.
  const targetMidY = target.y + target.height / 2;
  const screenMidY = (minTop + maxBottom) / 2;
  const top =
    targetMidY < screenMidY ? maxBottom - card.height : minTop;
  return {
    left: centeredLeft,
    top: clamp(top, minTop, maxBottom - card.height),
    side: "overlay",
    arrowX: null,
  };
}
