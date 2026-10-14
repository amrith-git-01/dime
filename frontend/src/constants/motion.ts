/**
 * Reanimated motion tokens — Dime Monochrome Design System.
 *
 * Principle: soft, subtle, spring-based. Animations should feel calm
 * and confident, not playful. Bounce is reserved for success confirmations.
 *
 * @see docs/design-system.md §8
 */
import type {
  WithSpringConfig,
  WithTimingConfig,
} from "react-native-reanimated";
import { Easing } from "react-native-reanimated";

/** Non-spring durations (panels, fade transitions, etc.) */
export const motion = {
  panelSlideMs: 180,
} as const;

export const springs = {
  /** Quick and decisive — buttons, day-cell selection, chip toggles. */
  snappy: { damping: 18, stiffness: 300, mass: 0.8 },
  /** Smooth and controlled — card transitions, progress bars. */
  smooth: { damping: 20, stiffness: 200, mass: 1.0 },
  /** Unhurried — panels sliding in, large surface transitions. */
  gentle: { damping: 24, stiffness: 150, mass: 1.2 },
  /** Reserved for success micro-animations (scale confirm). */
  bouncy: { damping: 12, stiffness: 280, mass: 0.9 },
  /** Progress bars — overshoot clamped. */
  progress: {
    damping: 20,
    stiffness: 200,
    mass: 1.0,
    overshootClamping: true,
  },
  /** FAB open/close center rotation. */
  fabOpen: { damping: 16, stiffness: 220, mass: 0.75 },
  /** Radial action bubbles appearing. */
  fabActions: { damping: 18, stiffness: 240, mass: 0.9 },
  /** Active tab liquid-pill travel. */
  tabIndicator: { damping: 16, stiffness: 200, mass: 0.8 },
  /** Press state scale — subtle depress (0.985 target). */
  press: { damping: 18, stiffness: 260, mass: 0.7 },
  /** App tour: spotlight hole gliding from one target to the next. */
  tourSpotlight: { damping: 24, stiffness: 190, mass: 1 },
  /** App tour: tooltip card gliding / popping in. */
  tourCard: { damping: 20, stiffness: 240, mass: 0.85 },
} as const satisfies Record<string, WithSpringConfig>;

export const timings = {
  fast: { duration: 150, easing: Easing.inOut(Easing.ease) },
  normal: { duration: 250, easing: Easing.inOut(Easing.ease) },
  panel: { duration: motion.panelSlideMs, easing: Easing.inOut(Easing.ease) },
  pressIn: { duration: 100, easing: Easing.inOut(Easing.ease) },
  pressOut: { duration: 140, easing: Easing.inOut(Easing.ease) },
  listEntrance: { duration: 120, easing: Easing.inOut(Easing.ease) },
  tabTravelUp: { duration: 120, easing: Easing.inOut(Easing.ease) },
  tabTravelDown: { duration: 180, easing: Easing.inOut(Easing.ease) },
  /** Agent FAB → modal expand/collapse. */
  agentExpand: { duration: 300, easing: Easing.out(Easing.cubic) },
  agentCollapse: { duration: 220, easing: Easing.in(Easing.cubic) },
  /** Screen transition (stack push/pop). */
  screenTransition: { duration: 280, easing: Easing.inOut(Easing.ease) },
} as const satisfies Record<string, WithTimingConfig>;

/** Staggered list row entrance (home feed). */
export const listEntrance = {
  translateYFrom: 10,
  opacityFrom: 0,
  homeStaggerMs: 16,
  homeStaggerCapMs: 64,
  /** Card/row press depress scale. */
  pressScale: 0.985,
  /** Button/chip press depress scale (slightly more pronounced). */
  chipPressScale: 0.97,
} as const;

/**
 * Skeleton opacity pulse — calmer, neutral.
 * Base color is now #EAEAEC (surfaceSunken), not purple-tinted.
 */
export const skeletonPulse = {
  durationMs: 800,
  opacityMin: 0.45,
  opacityMax: 1,
} as const;

/** Auto-close radial FAB menu after idle. */
export const fabIdleCloseMs = 2000;

/**
 * @deprecated FAB idle breathe removed in monochrome redesign.
 * Will be deleted when DimeTabBar is migrated.
 */
export const fabBreathe = {
  scaleMin: 1,
  scaleMax: 1.04,
  halfCycleMs: 1400,
} as const;
