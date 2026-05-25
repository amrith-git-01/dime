import type { ReactNode } from "react";
import Animated, {
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
} from "react-native-reanimated";

import { motion } from "@/constants/motion";

const ms = motion.panelSlideMs;

/**
 * Slide presets for LTR horizontal swaps:
 * - `fromStart`: enters from the left, exits to the left (e.g. primary / “back” panel).
 * - `fromEnd`: enters from the right, exits to the right (e.g. secondary panel).
 */
export const horizontalSlidePresets = {
  fromStart: {
    entering: SlideInLeft.duration(ms),
    exiting: SlideOutLeft.duration(ms),
  },
  fromEnd: {
    entering: SlideInRight.duration(ms),
    exiting: SlideOutRight.duration(ms),
  },
} as const;

export type HorizontalSlidePresetKey = keyof typeof horizontalSlidePresets;

type HorizontalSlidePanelProps = {
  /** Stable key for this branch (e.g. `"login"`). */
  panelKey: string;
  preset: HorizontalSlidePresetKey;
  children: ReactNode;
};

/**
 * One branch of a mode swap: mount when visible so Reanimated can run
 * `entering` / `exiting` when the branch toggles. Parent should render one
 * panel per mode with `condition && <HorizontalSlidePanel ...>`.
 */
export function HorizontalSlidePanel({
  panelKey,
  preset,
  children,
}: HorizontalSlidePanelProps) {
  const { entering, exiting } = horizontalSlidePresets[preset];

  return (
    <Animated.View key={panelKey} entering={entering} exiting={exiting}>
      {children}
    </Animated.View>
  );
}
