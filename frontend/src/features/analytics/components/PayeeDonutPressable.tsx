import { memo, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { ChartTooltipAnchor } from "@/components/shared";
import type { CounterpartyDonutDatum } from "@/features/analytics/utils/buildCounterpartyDonutData";
import { hitTestPayeeDonutSlice } from "@/features/analytics/utils/hitTestPayeeDonutSlice";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

const TOUCH_ANCHOR_SIZE = 32;

export type PayeeDonutPressableProps = {
  data: CounterpartyDonutDatum[];
  size: number;
  innerRadiusRatio: number;
  onSlicePress?: (
    slice: CounterpartyDonutDatum,
    anchor: ChartTooltipAnchor,
  ) => void;
  children: ReactNode;
};

export const PayeeDonutPressable = memo(function PayeeDonutPressable({
  data,
  size,
  innerRadiusRatio,
  onSlicePress,
  children,
}: PayeeDonutPressableProps) {
  const wrapRef = useRef<View>(null);

  return (
    <View
      ref={wrapRef}
      collapsable={false}
      style={[styles.wrap, { width: size, height: size }]}
    >
      {children}

      {onSlicePress ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Donut chart slice"
          onPress={(event) => {
            const { locationX, locationY } = event.nativeEvent;
            const slice = hitTestPayeeDonutSlice(
              locationX,
              locationY,
              data,
              size,
              innerRadiusRatio,
            );
            if (!slice) {
              return;
            }
            void triggerHaptic();
            wrapRef.current?.measureInWindow((chartX, chartY) => {
              const half = TOUCH_ANCHOR_SIZE / 2;
              onSlicePress(slice, {
                x: chartX + locationX - half,
                y: chartY + locationY - half,
                width: TOUCH_ANCHOR_SIZE,
                height: TOUCH_ANCHOR_SIZE,
              });
            });
          }}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
});
