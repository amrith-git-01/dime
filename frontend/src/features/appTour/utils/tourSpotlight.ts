import type { TourRect } from "@/lib/tour/tourTargetRegistry";

import type { TourSpotlightShape } from "../constants/tourSteps";

export type TourHole = TourRect & { radius: number };

const DEFAULT_RADIUS = 16;

/**
 * The spotlight hole for a target: the target grown by `padding`, kept inside the screen, with
 * the corner radius implied by the shape (circle / pill round fully, rounded uses `radius`).
 */
export function computeSpotlightHole(
  target: TourRect,
  options: {
    padding: number;
    shape: TourSpotlightShape;
    radius?: number;
    screen: { width: number; height: number };
  },
): TourHole {
  const { padding, shape, screen } = options;

  let x = target.x - padding;
  let y = target.y - padding;
  let width = target.width + padding * 2;
  let height = target.height + padding * 2;

  if (shape === "circle") {
    // A true circle around the element's center.
    const side = Math.max(width, height);
    x -= (side - width) / 2;
    y -= (side - height) / 2;
    width = side;
    height = side;
  }

  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(screen.width, x + width);
  const bottom = Math.min(screen.height, y + height);
  width = Math.max(0, right - left);
  height = Math.max(0, bottom - top);

  const maxRadius = Math.min(width, height) / 2;
  const radius =
    shape === "rounded"
      ? Math.min(options.radius ?? DEFAULT_RADIUS, maxRadius)
      : maxRadius;

  return { x: left, y: top, width, height, radius };
}

/** A zero-size hole at a point: the scrim fully covers the screen (centered-card steps). */
export function collapsedHole(point: { x: number; y: number }): TourHole {
  return { x: point.x, y: point.y, width: 0, height: 0, radius: 0 };
}

/**
 * Four rects that cover the screen except the hole. Touches inside the hole fall through to the
 * real element underneath; touches on these are absorbed.
 */
export function computeBlockerRects(
  hole: TourRect,
  screen: { width: number; height: number },
): TourRect[] {
  const holeRight = hole.x + hole.width;
  const holeBottom = hole.y + hole.height;
  return [
    { x: 0, y: 0, width: screen.width, height: hole.y },
    {
      x: 0,
      y: holeBottom,
      width: screen.width,
      height: Math.max(0, screen.height - holeBottom),
    },
    { x: 0, y: hole.y, width: hole.x, height: hole.height },
    {
      x: holeRight,
      y: hole.y,
      width: Math.max(0, screen.width - holeRight),
      height: hole.height,
    },
  ].map((rect) => ({
    ...rect,
    width: Math.max(0, rect.width),
    height: Math.max(0, rect.height),
  }));
}
