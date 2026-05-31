import { useCallback, useImperativeHandle, type Ref } from "react";
import type { LayoutChangeEvent, ViewProps } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

type TranslateAxis = { x: SharedValue<number>; y: SharedValue<number> };

export type ReceiptImageZoomRef = {
  reset: () => void;
};

export type UseReceiptImageZoomOptions = {
  minScale?: number;
  maxScale?: number;
  doubleTapScale?: number;
  ref?: Ref<ReceiptImageZoomRef>;
};

function clamp(value: number, min: number, max: number): number {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

function panLimit(size: number, scaleValue: number): number {
  "worklet";
  return (size * (scaleValue - 1)) / 2;
}

function moveIntoViewInstant(
  width: number,
  height: number,
  scale: SharedValue<number>,
  translate: TranslateAxis,
  focal: TranslateAxis,
  minScale: number,
): void {
  "worklet";
  if (width <= 0 || height <= 0) {
    return;
  }

  if (scale.value <= minScale) {
    scale.value = minScale;
    translate.x.value = 0;
    translate.y.value = 0;
    focal.x.value = 0;
    focal.y.value = 0;
    return;
  }

  const maxX = panLimit(width, scale.value);
  const maxY = panLimit(height, scale.value);
  const totalX = translate.x.value + focal.x.value;
  const totalY = translate.y.value + focal.y.value;

  translate.x.value = clamp(totalX, -maxX, maxX);
  translate.y.value = clamp(totalY, -maxY, maxY);
  focal.x.value = 0;
  focal.y.value = 0;
}

export function useReceiptImageZoom({
  minScale = 1,
  maxScale = 4,
  doubleTapScale = 2.5,
  ref,
}: UseReceiptImageZoomOptions = {}) {
  const layoutWidth = useSharedValue(0);
  const layoutHeight = useSharedValue(0);
  const centerX = useSharedValue(0);
  const centerY = useSharedValue(0);

  const scale = useSharedValue(minScale);
  const savedScale = useSharedValue(minScale);

  const translate = {
    x: useSharedValue(0),
    y: useSharedValue(0),
  };
  const savedTranslate = {
    x: useSharedValue(0),
    y: useSharedValue(0),
  };

  const focal = {
    x: useSharedValue(0),
    y: useSharedValue(0),
  };
  const savedFocal = {
    x: useSharedValue(0),
    y: useSharedValue(0),
  };
  const initialFocal = {
    x: useSharedValue(0),
    y: useSharedValue(0),
  };

  const reset = useCallback(() => {
    scale.value = minScale;
    savedScale.value = minScale;
    translate.x.value = 0;
    translate.y.value = 0;
    savedTranslate.x.value = 0;
    savedTranslate.y.value = 0;
    focal.x.value = 0;
    focal.y.value = 0;
    savedFocal.x.value = 0;
    savedFocal.y.value = 0;
    initialFocal.x.value = 0;
    initialFocal.y.value = 0;
  }, [
    focal.x,
    focal.y,
    initialFocal.x,
    initialFocal.y,
    minScale,
    savedFocal.x,
    savedFocal.y,
    savedScale,
    savedTranslate.x,
    savedTranslate.y,
    scale,
    translate.x,
    translate.y,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        reset();
      },
    }),
    [reset],
  );

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, y, width, height } = event.nativeEvent.layout;
      layoutWidth.value = width;
      layoutHeight.value = height;
      centerX.value = x + width / 2;
      centerY.value = y + height / 2;
    },
    [centerX, centerY, layoutHeight, layoutWidth],
  );

  const pinch = Gesture.Pinch()
    .onStart((event) => {
      savedScale.value = scale.value;
      savedFocal.x.value = focal.x.value;
      savedFocal.y.value = focal.y.value;
      initialFocal.x.value = event.focalX;
      initialFocal.y.value = event.focalY;
    })
    .onUpdate((event) => {
      const width = layoutWidth.value;
      const height = layoutHeight.value;
      if (width <= 0 || height <= 0) {
        return;
      }

      scale.value = clamp(savedScale.value * event.scale, minScale, maxScale);
      focal.x.value =
        savedFocal.x.value +
        (centerX.value - initialFocal.x.value) *
          (scale.value - savedScale.value);
      focal.y.value =
        savedFocal.y.value +
        (centerY.value - initialFocal.y.value) *
          (scale.value - savedScale.value);
    })
    .onEnd(() => {
      moveIntoViewInstant(
        layoutWidth.value,
        layoutHeight.value,
        scale,
        translate,
        focal,
        minScale,
      );
      savedScale.value = scale.value;
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onTouchesDown((_, manager) => {
      if (scale.value <= minScale) {
        manager.fail();
      }
    })
    .onStart(() => {
      savedTranslate.x.value = translate.x.value;
      savedTranslate.y.value = translate.y.value;
    })
    .onUpdate((event) => {
      if (scale.value <= minScale) {
        return;
      }
      translate.x.value = savedTranslate.x.value + event.translationX;
      translate.y.value = savedTranslate.y.value + event.translationY;
    })
    .onEnd(() => {
      moveIntoViewInstant(
        layoutWidth.value,
        layoutHeight.value,
        scale,
        translate,
        focal,
        minScale,
      );
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd((event) => {
      const width = layoutWidth.value;
      const height = layoutHeight.value;
      if (width <= 0 || height <= 0) {
        return;
      }

      if (scale.value > minScale) {
        scale.value = minScale;
        savedScale.value = minScale;
        translate.x.value = 0;
        translate.y.value = 0;
        focal.x.value = 0;
        focal.y.value = 0;
        savedFocal.x.value = 0;
        savedFocal.y.value = 0;
        return;
      }

      scale.value = doubleTapScale;
      savedScale.value = doubleTapScale;
      translate.x.value = 0;
      translate.y.value = 0;
      focal.x.value = (centerX.value - event.x) * (doubleTapScale - 1);
      focal.y.value = (centerY.value - event.y) * (doubleTapScale - 1);
      savedFocal.x.value = focal.x.value;
      savedFocal.y.value = focal.y.value;
      moveIntoViewInstant(
        width,
        height,
        scale,
        translate,
        focal,
        minScale,
      );
    });

  const gestures = Gesture.Race(
    doubleTap,
    Gesture.Simultaneous(pinch, pan),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translate.x.value },
      { translateY: translate.y.value },
      { translateX: focal.x.value },
      { translateY: focal.y.value },
      { scale: scale.value },
    ],
  }));

  const zoomSurfaceProps: Pick<ViewProps, "onLayout"> = {
    onLayout,
  };

  return {
    gestures,
    animatedStyle,
    zoomSurfaceProps,
    reset,
  };
}
