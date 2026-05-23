import { format } from "date-fns";
import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { bento, hero } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

export type BentoSevenDayBarChartProps = {
  /** Oldest → newest; length 7 */
  days: { date: string; total: number }[];
  barColor?: string;
  labelColor?: string;
  height?: number;
};

/** Mini 7-day debit bar chart for the Home "Spent Today" tile. */
export const BentoSevenDayBarChart = memo(function BentoSevenDayBarChart({
  days,
  barColor = hero.sparkBar,
  labelColor = bento.onSurface.muted,
  height = 40,
}: BentoSevenDayBarChartProps) {
  const max = useMemo(() => Math.max(1, ...days.map((d) => d.total)), [days]);

  return (
    <View style={[styles.root, { height: height + 14 }]}>
      <View style={[styles.barsRow, { height }]}>
        {days.map((day, index) => {
          const ratio = day.total / max;
          const barHeight = Math.max(
            day.total > 0 ? 4 : 2,
            Math.round(ratio * height),
          );
          const isToday = index === days.length - 1;
          return (
            <View key={day.date} style={styles.barCol}>
              <View
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    backgroundColor: barColor,
                    opacity: isToday ? 1 : 0.55,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.labelsRow}>
        {days.map((day) => (
          <Text
            key={`${day.date}-label`}
            style={[styles.dayLabel, { color: labelColor }]}
          >
            {format(new Date(`${day.date}T12:00:00`), "EEEEE")}
          </Text>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    width: "100%",
    justifyContent: "flex-end",
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    borderRadius: 3,
    minWidth: 4,
  },
  labelsRow: {
    flexDirection: "row",
    marginTop: 4,
    gap: 4,
  },
  dayLabel: {
    flex: 1,
    textAlign: "center",
    fontFamily: fontFamilies.medium,
    fontSize: 9,
    lineHeight: 12,
  },
});
