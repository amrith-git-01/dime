import { memo } from "react";
import { View } from "react-native";

import { createThemedStyles } from "@/theme";

import type { ForecastLanding } from "../types";
import { computeBandLayout } from "../utils/forecastFormat";

const TRACK_HEIGHT = 10;
const TICK_HEIGHT = 20;
const TICK_WIDTH = 2;

type ForecastBandProps = {
  landing: ForecastLanding;
  /** The landing is past the budget: the budget marker turns to the danger color. */
  overBudget: boolean;
};

/**
 * One track for the month: what is spent so far (solid), the p10-p90 range (tinted), the
 * middle of the range (a tick) and the budget (a line). Purely visual; the numbers are text
 * beside it, so it is hidden from screen readers.
 */
export const ForecastBand = memo(function ForecastBand({
  landing,
  overBudget,
}: ForecastBandProps) {
  const styles = useStyles();
  const layout = computeBandLayout(landing);
  const pct = (fraction: number) => `${fraction * 100}%` as const;

  return (
    <View
      style={styles.wrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.track}>
        <View style={[styles.spent, { width: pct(layout.spent) }]} />
        <View
          style={[
            styles.range,
            {
              left: pct(layout.bandStart),
              width: pct(Math.max(layout.bandEnd - layout.bandStart, 0.01)),
            },
          ]}
        />
      </View>
      <View style={[styles.tick, { left: pct(layout.p50) }]} />
      {layout.budget !== null ? (
        <View
          style={[
            styles.budget,
            overBudget && styles.budgetOver,
            { left: pct(layout.budget) },
          ]}
        />
      ) : null}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  wrap: {
    height: TICK_HEIGHT,
    justifyContent: "center",
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: colors.surfaceSunken,
    overflow: "hidden",
  },
  spent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.accent,
  },
  range: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: colors.accentTint,
  },
  tick: {
    position: "absolute",
    top: 0,
    width: TICK_WIDTH,
    height: TICK_HEIGHT,
    marginLeft: -TICK_WIDTH / 2,
    borderRadius: TICK_WIDTH / 2,
    backgroundColor: colors.ink,
  },
  budget: {
    position: "absolute",
    top: 0,
    width: TICK_WIDTH,
    height: TICK_HEIGHT,
    marginLeft: -TICK_WIDTH / 2,
    backgroundColor: colors.inkSoft,
  },
  budgetOver: {
    backgroundColor: colors.danger,
  },
}));
