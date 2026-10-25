/**
 * Pure logic of the Welcome feature reel: scene list, index math, when the reel may animate or
 * auto-advance, swipe resolution and layout fitting. No React, no Reanimated: unit tested.
 */

export const REEL_SCENES = [
  { id: "voice", caption: "Just say it" },
  { id: "receipt", caption: "Snap the receipt" },
  { id: "quickAdd", caption: "Add it in seconds" },
  { id: "budget", caption: "Know what's left" },
  { id: "insights", caption: "See where it went" },
  { id: "askAi", caption: "Ask anything" },
] as const;

export type ReelSceneId = (typeof REEL_SCENES)[number]["id"];

export const REEL_SCENE_COUNT = REEL_SCENES.length;

/** One scene's timeline (ms): its animation plus a short hold, then the reel moves on. */
export const REEL_SCENE_MS = 3500;

/**
 * The design footprint every scene is drawn on (same as the old welcome hero). The card surface
 * stretches to the column; this box is scaled to the card's height and centred inside it.
 */
export const REEL_CARD_WIDTH = 320;
export const REEL_CARD_HEIGHT = 264;
/**
 * Height around the card: gap (16) + one caption line + gap (10) + segments (16) below it. The
 * caption allows 1.2x font scaling, so its 24 dp line is reserved as 29.
 */
export const REEL_CHROME_HEIGHT = 71;
export const REEL_MIN_SCALE = 0.55;
/**
 * Below this much room for the card the reel is dropped rather than squeezed unreadable. It is the
 * card's height at the scale floor, so a visible reel never draws taller than the room it was given.
 */
export const REEL_MIN_CARD_HEIGHT = Math.ceil(REEL_CARD_HEIGHT * REEL_MIN_SCALE);

/** A horizontal drag past this distance (dp) or fling past this speed (dp/s) changes scene. */
const SWIPE_DISTANCE = 48;
const SWIPE_VELOCITY = 600;

/** Wraps any integer into `0..count-1` (so -1 is the last scene). */
export function wrapIndex(index: number, count: number = REEL_SCENE_COUNT) {
  if (count <= 0) {
    return 0;
  }
  return ((Math.trunc(index) % count) + count) % count;
}

export function nextIndex(index: number, count: number = REEL_SCENE_COUNT) {
  return wrapIndex(index + 1, count);
}

export function prevIndex(index: number, count: number = REEL_SCENE_COUNT) {
  return wrapIndex(index - 1, count);
}

/** Target of tapping a progress segment; anything out of range keeps the current scene. */
export function resolveSegmentJump(
  target: number,
  current: number,
  count: number = REEL_SCENE_COUNT,
) {
  if (!Number.isInteger(target) || target < 0 || target >= count) {
    return current;
  }
  return target;
}

export type ReelRunInputs = {
  /** The app is in the foreground. */
  appActive: boolean;
  /** The Welcome screen is the focused screen of its navigator. */
  screenFocused: boolean;
  /** Something else asked for a pause (Google sign-in in progress). */
  externalPause: boolean;
  /** The user is pressing or dragging the card. */
  held: boolean;
  reduceMotion: boolean;
  screenReader: boolean;
};

/** Whether scene animations and the progress clock may run right now. */
export function isReelAnimating(inputs: ReelRunInputs) {
  return (
    !inputs.reduceMotion &&
    inputs.appActive &&
    inputs.screenFocused &&
    !inputs.externalPause &&
    !inputs.held
  );
}

/**
 * Whether the reel moves to the next scene on its own. Reduced motion and screen readers get a
 * reel that only changes when the user asks (WCAG 2.2.2: moving content must be stoppable).
 */
export function shouldAutoAdvance(inputs: ReelRunInputs) {
  return isReelAnimating(inputs) && !inputs.screenReader;
}

/** +1 = next (swipe left), -1 = previous (swipe right), 0 = not a swipe. */
export function resolveSwipe(translationX: number, velocityX: number): -1 | 0 | 1 {
  if (Math.abs(translationX) >= SWIPE_DISTANCE) {
    return translationX < 0 ? 1 : -1;
  }
  if (Math.abs(velocityX) >= SWIPE_VELOCITY && Math.abs(translationX) > 8) {
    return velocityX < 0 ? 1 : -1;
  }
  return 0;
}

export type SegmentFill = "full" | "live" | "empty";

/**
 * How a progress segment is drawn: past scenes full, the active one filling with the clock,
 * upcoming ones empty. While the scene is leaving ("exiting", clock stopped) the active segment
 * completes at once instead of freezing part-filled. With reduced motion there is no clock, so
 * only the active one is filled.
 */
export function getSegmentFill(
  segmentIndex: number,
  activeIndex: number,
  reduceMotion: boolean,
  phase: "playing" | "exiting",
): SegmentFill {
  if (reduceMotion) {
    return segmentIndex === activeIndex ? "full" : "empty";
  }
  if (segmentIndex < activeIndex) {
    return "full";
  }
  if (segmentIndex === activeIndex) {
    return phase === "exiting" ? "full" : "live";
  }
  return "empty";
}

export function reelAccessibilityLabel(
  index: number,
  count: number = REEL_SCENE_COUNT,
) {
  const safe = wrapIndex(index, count);
  return `Feature preview, ${REEL_SCENES[safe].caption}, ${safe + 1} of ${count}`;
}

export type ReelLayout = {
  visible: boolean;
  scale: number;
  width: number;
  height: number;
};

/**
 * Fits the card (and the chrome around it) into the room the screen can spare. The card is as
 * wide as the column; `scale` sizes the design box drawn inside it.
 */
export function computeReelLayout(
  availableWidth: number,
  availableHeight: number,
): ReelLayout {
  const cardRoom = availableHeight - REEL_CHROME_HEIGHT;
  if (cardRoom < REEL_MIN_CARD_HEIGHT || availableWidth <= 0) {
    return { visible: false, scale: 0, width: 0, height: 0 };
  }
  const fit = Math.min(
    1,
    cardRoom / REEL_CARD_HEIGHT,
    availableWidth / REEL_CARD_WIDTH,
  );
  const scale = Math.max(fit, REEL_MIN_SCALE);
  return {
    visible: true,
    scale,
    width: availableWidth,
    height: REEL_CARD_HEIGHT * scale,
  };
}
