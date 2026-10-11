import {
  INSIGHTS_CHART_BAR_ANIMATION,
  INSIGHTS_CHART_DONUT_ANIMATION,
} from "@/features/analytics/constants/chartAnimation";
import { usePieClockwiseEntry } from "@/features/analytics/hooks/usePieClockwiseEntry";
import { chartAnimationTiming } from "@/features/analytics/utils/chartAnimationTiming";

/** Agent charts mount in-view inside chat — animate once per stable chart identity. */
export function useAgentDonutReveal(revealKey: string) {
  return usePieClockwiseEntry({
    identity: `agent-donut-${revealKey}`,
    enabled: true,
    isVisible: true,
    animateConfig: INSIGHTS_CHART_DONUT_ANIMATION,
  });
}

export const AGENT_BAR_CHART_TIMING = chartAnimationTiming(
  INSIGHTS_CHART_BAR_ANIMATION,
);

/** Stagger bar rise only for shorter series; 30-day charts rise together. */
export const AGENT_BAR_STAGGER_MS = 18;
export const AGENT_BAR_STAGGER_MAX_BARS = 14;
