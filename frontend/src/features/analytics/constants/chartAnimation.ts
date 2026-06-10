import type {
  WithSpringConfig,
  WithTimingConfig,
} from "react-native-reanimated";

import { springs, timings } from "@/constants/motion";

export type ChartPathAnimationConfig =
  | ({ type: "spring" } & WithSpringConfig)
  | ({ type: "timing" } & WithTimingConfig);

/** Bar grow — spring per Victory Native XL mount guidance. */
export const INSIGHTS_CHART_BAR_ANIMATION = {
  type: "spring" as const,
  damping: springs.gentle.damping,
  stiffness: springs.gentle.stiffness,
  mass: springs.gentle.mass,
} satisfies ChartPathAnimationConfig;

/** Line path — timing for predictable month transitions. */
export const INSIGHTS_CHART_LINE_ANIMATION = {
  type: "timing" as const,
  duration: timings.normal.duration,
  easing: timings.normal.easing,
} satisfies ChartPathAnimationConfig;

/** Pie / donut slice sweep — spring grow on focus. */
export const INSIGHTS_CHART_PIE_ANIMATION = INSIGHTS_CHART_BAR_ANIMATION;
