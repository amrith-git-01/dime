import { View } from "react-native";

import { radius } from "@/constants";
import { createThemedStyles } from "@/theme";

type ProgressBarProps = {
  progress: number;
  backgroundColor?: string;
  fillColor?: string;
  height?: number;
};

function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Static progress track — no Reanimated. Use in FlashList rows to avoid
 * mount/recycle animations while scrolling.
 */
export function ProgressBar({
  progress,
  backgroundColor,
  fillColor,
  height = 8,
}: ProgressBarProps) {
  const styles = useStyles();
  const clamped = clampProgress(progress);

  return (
    <View style={[
        styles.track,
        backgroundColor != null && { backgroundColor },
        { height },
      ]}>
      {clamped > 0 ? (
        <View
          style={[
            styles.fill,
            fillColor != null && { backgroundColor: fillColor },
            {
              height,
              borderRadius: height / 2,
              width: `${clamped * 100}%`,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  track: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.full,
    overflow: "hidden",
    width: "100%",
  },
  fill: {
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
  },
}));
