import { StyleSheet, View } from "react-native";

import { progressBar, radius } from "@/constants/theme";

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
  backgroundColor = progressBar.track,
  fillColor = progressBar.fillDefault,
  height = 8,
}: ProgressBarProps) {
  const clamped = clampProgress(progress);

  return (
    <View style={[styles.track, { backgroundColor, height }]}>
      {clamped > 0 ? (
        <View
          style={[
            styles.fill,
            {
              height,
              backgroundColor: fillColor,
              borderRadius: height / 2,
              width: `${clamped * 100}%`,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: radius.full,
    overflow: "hidden",
    width: "100%",
  },
  fill: {
    alignSelf: "flex-start",
  },
});
