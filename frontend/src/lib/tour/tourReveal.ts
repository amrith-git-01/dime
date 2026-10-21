import { tourTargetIds } from "@/constants/tourTargetIds";

import {
  computeRevealOffset,
  getTourScroller,
  type TourScrollKey,
} from "./tourScrollRegistry";
import { measureTourTarget } from "./tourTargetRegistry";

/** Space above the tab bar the floating buttons take (dp): targets are scrolled clear of it. */
export const TOUR_BOTTOM_CHROME = 120;

/** What a step needs to bring its target into view. */
export type TourRevealRequest = {
  targetId: string;
  scrollKey: TourScrollKey;
  /** Scrolled to first while the target itself is not mounted (a list row beyond the draw distance). */
  anchorId?: string;
  windowHeight: number;
  /** Height the tab bar (and the bottom inset) takes at the bottom of the window. */
  bottomReserved: number;
  /** Used when the app header cannot be measured. */
  fallbackTop: number;
};

/**
 * One scroll step towards showing the target: the offset it scrolled to, or null when nothing
 * needed (or nothing could be) done. Callers re-measure afterwards, because the scroll is animated.
 */
export async function revealTourTargetOnce(
  request: TourRevealRequest,
): Promise<number | null> {
  const scroller = getTourScroller(request.scrollKey);
  if (!scroller) {
    return null;
  }
  const header = await measureTourTarget(tourTargetIds.appHeader);
  const viewportTop = header ? header.y + header.height : request.fallbackTop;
  // The floating buttons sit above the tab bar: a target behind them counts as out of view too.
  const viewportBottom =
    request.windowHeight - request.bottomReserved - TOUR_BOTTOM_CHROME;

  let rect = await measureTourTarget(request.targetId);
  if (!rect && request.anchorId) {
    rect = await measureTourTarget(request.anchorId);
  }
  if (!rect) {
    return null;
  }
  const next = computeRevealOffset({
    targetY: rect.y,
    targetHeight: rect.height,
    viewportTop,
    viewportBottom,
    currentOffset: scroller.getOffset(),
  });
  if (next === null) {
    return null;
  }
  scroller.scrollTo(next, true);
  return next;
}
