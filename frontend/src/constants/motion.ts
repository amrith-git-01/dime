/**
 * Reanimated motion tokens — aligned with docs/core/design-system.md § Animation System.
 */
import type {
  WithSpringConfig,
  WithTimingConfig,
} from "react-native-reanimated";
import { Easing } from "react-native-reanimated";

/** Non-spring durations (panels, skeleton opacity loop, etc.) */
export const motion = {
  panelSlideMs: 180,
} as const;

export const springs = {
  snappy: { damping: 18, stiffness: 300, mass: 0.8 },
  smooth: { damping: 20, stiffness: 200, mass: 1.0 },
  gentle: { damping: 24, stiffness: 150, mass: 1.2 },
  bouncy: { damping: 12, stiffness: 280, mass: 0.9 },
  progress: {
    damping: 20,
    stiffness: 200,
    mass: 1.0,
    overshootClamping: true,
  },
  /** Center + rotation when FAB menu opens. */
  fabOpen: { damping: 16, stiffness: 220, mass: 0.75 },
  /** Radial manual / photo / voice bubbles. */
  fabActions: { damping: 18, stiffness: 240, mass: 0.9 },
  /** Active tab liquid pill travel. */
  tabIndicator: { damping: 16, stiffness: 200, mass: 0.8 },
} as const satisfies Record<string, WithSpringConfig>;

export const timings = {
  fast: { duration: 150, easing: Easing.inOut(Easing.ease) },
  normal: { duration: 250, easing: Easing.inOut(Easing.ease) },
  panel: { duration: motion.panelSlideMs, easing: Easing.inOut(Easing.ease) },
  pressIn: { duration: 120, easing: Easing.inOut(Easing.ease) },
  pressOut: { duration: 160, easing: Easing.inOut(Easing.ease) },
  listEntrance: { duration: 120, easing: Easing.inOut(Easing.ease) },
  tabTravelUp: { duration: 120, easing: Easing.inOut(Easing.ease) },
  tabTravelDown: { duration: 180, easing: Easing.inOut(Easing.ease) },
  /** Agent FAB → modal (Material-style ease-out expand, ease-in collapse). */
  agentExpand: { duration: 300, easing: Easing.out(Easing.cubic) },
  agentCollapse: { duration: 220, easing: Easing.in(Easing.cubic) },
} as const satisfies Record<string, WithTimingConfig>;

/** Staggered list row entrance (home feed). */
export const listEntrance = {
  translateYFrom: 10,
  opacityFrom: 0,
  homeStaggerMs: 16,
  homeStaggerCapMs: 64,
  pressScale: 0.98,
} as const;

/** Skeleton opacity pulse (UI thread). */
export const skeletonPulse = {
  durationMs: 700,
  opacityMin: 0.55,
  opacityMax: 1,
} as const;

/** Main tab-bar FAB idle breathe (design: 1.0 → 1.04, 2800ms loop). */
export const fabBreathe = {
  scaleMin: 1,
  scaleMax: 1.04,
  halfCycleMs: 1400,
} as const;

/** Auto-close radial FAB menu after no interaction. */
export const fabIdleCloseMs = 2000;
