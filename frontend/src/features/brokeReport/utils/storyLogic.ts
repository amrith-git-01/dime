import {
  REPORT_SLIDE_IDS,
  type ReportSlideId,
  type ReportSnapshot,
} from "../types";
import { parseAmount } from "./reportFormat";

/**
 * Pure logic of the story player: which slides play, how long each stays, and what a tap or a
 * swipe means. No React, no Reanimated: unit tested.
 */

const KNOWN_SLIDES: ReadonlySet<string> = new Set(REPORT_SLIDE_IDS);

/** Default time a slide stays (ms): the entrance plus a hold long enough to read it. */
export const DEFAULT_SLIDE_MS = 4500;

/** Denser slides get longer. The closing slide never moves on by itself (it is the end). */
export const SLIDE_DURATION_MS: Readonly<Record<ReportSlideId, number>> = {
  cover: 4000,
  damage: 4500,
  lineup: 6000,
  regular: 4500,
  moment: 5500,
  rhythm: 6000,
  win: 4500,
  closing: 6000,
};

export function slideDurationMs(id: ReportSlideId): number {
  return SLIDE_DURATION_MS[id] ?? DEFAULT_SLIDE_MS;
}

const WIN_KINDS: readonly string[] = ["category_down", "no_spend_streak", "lowest_month"];

/** Whether the snapshot has what the slide shows. A slide without data is never drawn. */
export function slideHasData(id: ReportSlideId, snapshot: ReportSnapshot): boolean {
  switch (id) {
    case "cover":
    case "damage":
    case "closing":
      return true;
    case "lineup":
      return snapshot.categories.length > 0;
    case "regular":
      return snapshot.top_payee !== null;
    case "moment":
      return snapshot.biggest_spend !== null || snapshot.busiest_day !== null;
    case "rhythm":
      return snapshot.weekday.totals.some((total) => parseAmount(total) > 0);
    case "win":
      // The kinds the copy can tell: the same list as `resolveReportCopy`, so a win slide is never
      // drawn for a kind it has no words for.
      return WIN_KINDS.includes(snapshot.win.kind);
  }
}

/**
 * The slides to play, in the server's order: ids this build does not know are dropped, repeats
 * are dropped, and so is a slide whose data is missing. Empty when the snapshot has no usable slide.
 */
export function resolveSlides(snapshot: ReportSnapshot): ReportSlideId[] {
  const seen = new Set<string>();
  const slides: ReportSlideId[] = [];
  for (const id of snapshot.slides) {
    if (!KNOWN_SLIDES.has(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    if (slideHasData(id as ReportSlideId, snapshot)) {
      slides.push(id as ReportSlideId);
    }
  }
  return slides;
}

/** A month with few slides is a sparse month: the cover says so. */
export const SPARSE_SLIDE_COUNT = 4;

export function isSparseReport(slides: readonly ReportSlideId[]): boolean {
  return slides.length <= SPARSE_SLIDE_COUNT;
}

export type TapZone = "previous" | "next";

/** The left third goes back, the rest goes forward. */
export function resolveTapZone(x: number, width: number): TapZone {
  return width > 0 && x < width / 3 ? "previous" : "next";
}

/** A downward drag past this distance (dp) or fling past this speed (dp/s) closes the story. */
const CLOSE_DISTANCE = 90;
const CLOSE_VELOCITY = 900;

export function shouldCloseOnSwipe(translationY: number, velocityY: number): boolean {
  return (
    translationY >= CLOSE_DISTANCE ||
    (velocityY >= CLOSE_VELOCITY && translationY > 24)
  );
}

export type StoryRunInputs = {
  appActive: boolean;
  screenFocused: boolean;
  /** Something else asked for a pause (the share sheet is opening). */
  externalPause: boolean;
  /** The user is pressing or dragging the slide. */
  held: boolean;
};

/** Whether the slide clock may run right now. */
export function isStoryRunning(inputs: StoryRunInputs): boolean {
  return (
    inputs.appActive &&
    inputs.screenFocused &&
    !inputs.externalPause &&
    !inputs.held
  );
}

/**
 * Reduced motion and screen readers get the final frame of every slide and no auto-advance: the
 * story only changes when the user asks (WCAG 2.2.2: moving content must be stoppable).
 */
export function usesStaticFrames(reduceMotion: boolean, screenReader: boolean): boolean {
  return reduceMotion || screenReader;
}

export type SegmentFill = "full" | "live" | "empty";

export function getSegmentFill(
  segmentIndex: number,
  activeIndex: number,
  staticFrames: boolean,
): SegmentFill {
  if (segmentIndex < activeIndex) {
    return "full";
  }
  if (segmentIndex === activeIndex) {
    return staticFrames ? "full" : "live";
  }
  return "empty";
}
