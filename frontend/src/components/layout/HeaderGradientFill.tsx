import { useCallback, useId, useState } from "react";
import {
  LayoutChangeEvent,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { colors } from "@/constants";

type HeaderGradientFillProps = {
  style?: StyleProp<ViewStyle>;
};

/**
 * App-header gradient (brand violet → lighter violet). Fills its layout box.
 */
export function HeaderGradientFill({ style }: HeaderGradientFillProps) {
  const gradientId = `headerGrad_${useId().replace(/:/g, "")}`;
  const [size, setSize] = useState({ w: 0, h: 0 });

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ w: width, h: height });
  }, []);

  return (
    <View style={[styles.fill, style]} onLayout={onLayout}>
      {size.w > 0 && size.h > 0 ? (
        <Svg
          width={size.w}
          height={size.h}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Defs>
            <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={colors.headerGradientStart} />
              <Stop offset="100%" stopColor={colors.headerGradientEnd} />
            </LinearGradient>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={size.w}
            height={size.h}
            fill={`url(#${gradientId})`}
          />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});
