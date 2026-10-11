import type {
  WithSpringConfig,
  WithTimingConfig,
} from "react-native-reanimated";
import { Easing } from "react-native-reanimated";

export type ChartPathAnimationConfig =
  | ({ type: "spring" } & WithSpringConfig)
  | ({ type: "timing" } & WithTimingConfig);

/** Bar rise — smooth ease-out when the card enters the viewport. */
export const INSIGHTS_CHART_BAR_ANIMATION = {
  type: "timing" as const,
  duration: 720,
  easing: Easing.out(Easing.cubic),
} satisfies ChartPathAnimationConfig;

/** Income / expense lines — matched to bar rise for a unified reveal. */
export const INSIGHTS_CHART_LINE_ANIMATION = {
  type: "timing" as const,
  duration: 720,
  easing: Easing.out(Easing.cubic),
} satisfies ChartPathAnimationConfig;

/** Donut slice sweep — slightly longer than bars for a calm reveal. */
export const INSIGHTS_CHART_DONUT_ANIMATION = {
  type: "timing" as const,
  duration: 800,
  easing: Easing.out(Easing.cubic),
} satisfies ChartPathAnimationConfig;
