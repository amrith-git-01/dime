import {
  computeTourCardPlacement,
  TOUR_ARROW_EDGE_INSET,
  TOUR_CARD_GAP,
  TOUR_CARD_MARGIN,
  type TourInsets,
} from "../tourPlacement";

const screen = { width: 390, height: 844 };
const insets: TourInsets = { top: 47, right: 0, bottom: 34, left: 0 };
const card = { width: 340, height: 220 };

function assertInsideSafeArea(
  placement: { left: number; top: number },
  cardSize = card,
) {
  expect(placement.left).toBeGreaterThanOrEqual(TOUR_CARD_MARGIN);
  expect(placement.left + cardSize.width).toBeLessThanOrEqual(
    screen.width - TOUR_CARD_MARGIN,
  );
  expect(placement.top).toBeGreaterThanOrEqual(insets.top + TOUR_CARD_MARGIN);
  expect(placement.top + cardSize.height).toBeLessThanOrEqual(
    screen.height - insets.bottom - TOUR_CARD_MARGIN,
  );
}

describe("computeTourCardPlacement", () => {
  it("centers the card when there is no target", () => {
    const placement = computeTourCardPlacement({
      target: null,
      card,
      screen,
      insets,
    });
    expect(placement.side).toBe("center");
    expect(placement.arrowX).toBeNull();
    expect(placement.left).toBe((screen.width - card.width) / 2);
    assertInsideSafeArea(placement);
  });

  it("places the card below a target near the top, with the arrow under its center", () => {
    const target = { x: 300, y: 50, width: 40, height: 40 };
    const placement = computeTourCardPlacement({
      target,
      card,
      screen,
      insets,
    });
    expect(placement.side).toBe("below");
    expect(placement.top).toBe(target.y + target.height + TOUR_CARD_GAP);
    assertInsideSafeArea(placement);
    // The card is clamped to the screen edge, so the arrow slides right to keep pointing at it.
    expect(placement.left).toBeLessThan(target.x + target.width / 2 - card.width / 2);
    const targetCenterX = target.x + target.width / 2;
    expect((placement.arrowX ?? 0) + placement.left).toBeCloseTo(
      targetCenterX,
      5,
    );
  });

  it("places the card above a target near the bottom", () => {
    const target = { x: 165, y: 760, width: 60, height: 60 };
    const placement = computeTourCardPlacement({
      target,
      card,
      screen,
      insets,
    });
    expect(placement.side).toBe("above");
    expect(placement.top + card.height + TOUR_CARD_GAP).toBe(target.y);
    assertInsideSafeArea(placement);
  });

  it("honours the preferred side when it fits and flips when it does not", () => {
    const middle = { x: 100, y: 400, width: 190, height: 60 };
    expect(
      computeTourCardPlacement({
        target: middle,
        card,
        screen,
        insets,
        preferred: "above",
      }).side,
    ).toBe("above");
    expect(
      computeTourCardPlacement({
        target: middle,
        card,
        screen,
        insets,
        preferred: "below",
      }).side,
    ).toBe("below");

    const nearBottom = { x: 100, y: 770, width: 190, height: 50 };
    expect(
      computeTourCardPlacement({
        target: nearBottom,
        card,
        screen,
        insets,
        preferred: "below",
      }).side,
    ).toBe("above");
  });

  it("keeps the arrow clear of the card corners for targets at the screen edges", () => {
    const leftEdge = computeTourCardPlacement({
      target: { x: 0, y: 300, width: 20, height: 20 },
      card,
      screen,
      insets,
    });
    expect(leftEdge.arrowX).toBeGreaterThanOrEqual(TOUR_ARROW_EDGE_INSET);

    const rightEdge = computeTourCardPlacement({
      target: { x: 370, y: 300, width: 20, height: 20 },
      card,
      screen,
      insets,
    });
    expect(rightEdge.arrowX).toBeLessThanOrEqual(
      card.width - TOUR_ARROW_EDGE_INSET,
    );
  });

  it("overlaps a target too tall for either side, from the roomier edge and without an arrow", () => {
    const tall = { x: 16, y: 100, width: 358, height: 640 };
    const placement = computeTourCardPlacement({
      target: tall,
      card,
      screen,
      insets,
    });
    expect(placement.side).toBe("overlay");
    expect(placement.arrowX).toBeNull();
    assertInsideSafeArea(placement);
  });

  it("stays inside the safe area on a small screen", () => {
    const smallScreen = { width: 320, height: 568 };
    const smallInsets: TourInsets = { top: 20, right: 0, bottom: 0, left: 0 };
    const smallCard = { width: 288, height: 240 };
    for (const y of [24, 150, 300, 480, 540]) {
      const placement = computeTourCardPlacement({
        target: { x: 120, y, width: 80, height: 40 },
        card: smallCard,
        screen: smallScreen,
        insets: smallInsets,
      });
      expect(placement.left).toBeGreaterThanOrEqual(TOUR_CARD_MARGIN);
      expect(placement.left + smallCard.width).toBeLessThanOrEqual(
        smallScreen.width - TOUR_CARD_MARGIN,
      );
      expect(placement.top).toBeGreaterThanOrEqual(
        smallInsets.top + TOUR_CARD_MARGIN,
      );
      expect(placement.top + smallCard.height).toBeLessThanOrEqual(
        smallScreen.height - smallInsets.bottom - TOUR_CARD_MARGIN,
      );
    }
  });
});
