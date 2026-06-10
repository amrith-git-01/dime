import { useEffect, useState } from "react";

import { timings } from "@/constants/motion";
import type { ChartPathAnimationConfig } from "../constants/chartAnimation";

const ANIMATION_COOLDOWN_MS = timings.normal.duration + 400;

/**
 * Victory `animate` for one mount cycle (`animationKey` change = fresh chart instance).
 * Clears after cooldown so background insight refetches do not replay paths.
 */
export function useChartPathAnimation(
  animationKey: string,
  config: ChartPathAnimationConfig,
): ChartPathAnimationConfig | undefined {
  const [animate, setAnimate] = useState<ChartPathAnimationConfig | undefined>(
    config,
  );

  useEffect(() => {
    setAnimate(config);
    const timer = setTimeout(() => {
      setAnimate(undefined);
    }, ANIMATION_COOLDOWN_MS);

    return () => clearTimeout(timer);
  }, [animationKey, config]);

  return animate;
}
