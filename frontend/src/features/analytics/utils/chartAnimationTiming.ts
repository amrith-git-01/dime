import { Easing, type WithTimingConfig } from "react-native-reanimated";

import type { ChartPathAnimationConfig } from "@/features/analytics/constants/chartAnimation";

export type ChartAnimationTiming = {
  duration: number;
  easing: NonNullable<WithTimingConfig["easing"]>;
};

export function chartAnimationTiming(
  config: ChartPathAnimationConfig,
  defaultDuration = 720,
): ChartAnimationTiming {
  if (config.type === "timing") {
    return {
      duration: config.duration ?? defaultDuration,
      easing: config.easing ?? Easing.out(Easing.cubic),
    };
  }
  return {
    duration: defaultDuration,
    easing: Easing.out(Easing.cubic),
  };
}
