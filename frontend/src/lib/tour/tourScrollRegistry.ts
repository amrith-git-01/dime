/** Screens whose scroll position the tour can drive. */
export type TourScrollKey = "home" | "transactions" | "budgets" | "insights";

export type TourScrollHandle = {
  /** Scrolls the screen's list to a vertical offset (dp from the top of its content). */
  scrollTo: (offset: number, animated: boolean) => void;
  /** Where the list is scrolled to right now (tracked from its scroll events). */
  getOffset: () => number;
};

const scrollers = new Map<TourScrollKey, TourScrollHandle>();

/** Registers a screen's scroller; returns the unregister function (a no-op if another took the key). */
export function registerTourScroller(
  key: TourScrollKey,
  handle: TourScrollHandle,
): () => void {
  scrollers.set(key, handle);
  return () => {
    if (scrollers.get(key) === handle) {
      scrollers.delete(key);
    }
  };
}

export function getTourScroller(key: TourScrollKey): TourScrollHandle | undefined {
  return scrollers.get(key);
}

/** Breathing room kept between a revealed target and the edge of the visible area (dp). */
export const TOUR_REVEAL_MARGIN = 14;

export type RevealOffsetInput = {
  /** Target top and height in window coordinates. */
  targetY: number;
  targetHeight: number;
  /** The visible band of the screen (below the header, above the tab bar). */
  viewportTop: number;
  viewportBottom: number;
  currentOffset: number;
  margin?: number;
};

/**
 * Where to scroll so a target is in view: null when it already is (or when scrolling cannot help),
 * otherwise the offset that puts its top just under the visible band's top edge, which leaves
 * the most room below it for the tour card. A target taller than the band counts as in view once
 * its top is.
 */
export function computeRevealOffset({
  targetY,
  targetHeight,
  viewportTop,
  viewportBottom,
  currentOffset,
  margin = TOUR_REVEAL_MARGIN,
}: RevealOffsetInput): number | null {
  const bandHeight = viewportBottom - viewportTop;
  const targetBottom = targetY + targetHeight;
  const tooTall = targetHeight > bandHeight - margin * 2;
  const inView = tooTall
    ? targetY >= viewportTop - 1 && targetY < viewportBottom - 48
    : targetY >= viewportTop - 1 && targetBottom <= viewportBottom + 1;
  if (inView) {
    return null;
  }
  const next = Math.max(0, currentOffset + (targetY - (viewportTop + margin)));
  return Math.abs(next - currentOffset) < 2 ? null : next;
}
