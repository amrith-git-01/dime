import { useSharedValue } from "react-native-reanimated";

/** Idle value of a ring's clock: past its end, so nothing draws. */
export const TOUR_RING_IDLE = Number.MAX_SAFE_INTEGER;

/**
 * Every shared value the tour's single Skia canvas (the scrim) draws from. They live as long as the
 * tour run does, so the canvas is created once per run and never per step or per pause: the stage
 * (which comes and goes with the screen the user is on) only writes to them.
 */
export function useTourScrimValues(start: { x: number; y: number }) {
  return {
    holeX: useSharedValue(start.x),
    holeY: useSharedValue(start.y),
    holeWidth: useSharedValue(0),
    holeHeight: useSharedValue(0),
    holeRadius: useSharedValue(0),
    enter: useSharedValue(0),
    pulse: useSharedValue(0),
    emphasis: useSharedValue(0.4),
    trailFromX: useSharedValue(0),
    trailFromY: useSharedValue(0),
    trailToX: useSharedValue(0),
    trailToY: useSharedValue(0),
    trailClock: useSharedValue(TOUR_RING_IDLE),
    rippleX: useSharedValue(0),
    rippleY: useSharedValue(0),
    rippleClock: useSharedValue(TOUR_RING_IDLE),
    warpX: useSharedValue(0),
    warpY: useSharedValue(0),
    warpClock: useSharedValue(TOUR_RING_IDLE),
  };
}

export type TourScrimValues = ReturnType<typeof useTourScrimValues>;
