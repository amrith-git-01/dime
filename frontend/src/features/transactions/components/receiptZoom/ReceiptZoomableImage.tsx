import type { ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";

import {
  useReceiptImageZoom,
  type ReceiptImageZoomRef,
  type UseReceiptImageZoomOptions,
} from "./useReceiptImageZoom";

type ReceiptZoomableImageProps = UseReceiptImageZoomOptions & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function ReceiptZoomableImage({
  children,
  style,
  ref,
  ...zoomOptions
}: ReceiptZoomableImageProps) {
  const { gestures, animatedStyle, zoomSurfaceProps } = useReceiptImageZoom({
    ref,
    ...zoomOptions,
  });

  return (
    <GestureDetector gesture={gestures}>
      <Animated.View
        style={[styles.surface, style, animatedStyle]}
        {...zoomSurfaceProps}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

export type { ReceiptImageZoomRef };

const styles = StyleSheet.create({
  surface: {
    width: "100%",
    height: "100%",
  },
});
