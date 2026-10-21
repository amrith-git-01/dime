import type { RefObject } from "react";
import type { View } from "react-native";

/** A rectangle in window coordinates (what `measureInWindow` reports). */
export type TourRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TourTargetRef = RefObject<View | null>;

/**
 * Elements the app tour can spotlight, keyed by `tourTargetIds`. Refs only: the tour measures on
 * demand, so nothing re-renders when a target mounts, moves or scrolls.
 */
const targets = new Map<string, TourTargetRef>();

/** Registers a target; returns the unregister function (a no-op if another ref took the id). */
export function registerTourTarget(id: string, ref: TourTargetRef): () => void {
  targets.set(id, ref);
  return () => {
    if (targets.get(id) === ref) {
      targets.delete(id);
    }
  };
}

/** A rect worth spotlighting: finite, non-empty, and not entirely off the window. */
export function isUsableTourRect(
  rect: TourRect,
  windowWidth: number,
  windowHeight: number,
): boolean {
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height)
  ) {
    return false;
  }
  if (rect.width < 2 || rect.height < 2) {
    return false;
  }
  return (
    rect.x + rect.width > 0 &&
    rect.y + rect.height > 0 &&
    rect.x < windowWidth &&
    rect.y < windowHeight
  );
}

/** True when two rects differ by less than `tolerance` px on every side. */
export function tourRectsEqual(
  a: TourRect | null,
  b: TourRect | null,
  tolerance = 1,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    Math.abs(a.x - b.x) < tolerance &&
    Math.abs(a.y - b.y) < tolerance &&
    Math.abs(a.width - b.width) < tolerance &&
    Math.abs(a.height - b.height) < tolerance
  );
}

/** A view that never answers a measure (detached from the window) must not stall the tour. */
const MEASURE_TIMEOUT_MS = 350;

/** Measures a registered target in window coordinates; null when not mounted, not laid out, or not answering. */
export function measureTourTarget(id: string): Promise<TourRect | null> {
  const node = targets.get(id)?.current;
  if (!node) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), MEASURE_TIMEOUT_MS);
    node.measureInWindow((x, y, width, height) => {
      clearTimeout(timer);
      resolve({ x, y, width, height });
    });
  });
}
