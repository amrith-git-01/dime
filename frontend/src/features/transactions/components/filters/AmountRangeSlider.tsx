import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type AccessibilityActionEvent, type LayoutChangeEvent, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { createThemedStyles } from "@/theme";
import { formatInrCompact } from "@/utils/currency";

import {
  amountAtIndex,
  nudgeAmountThumb,
  snapThumbIndex,
  type AmountDomain,
} from "../../utils/amountRange";

/** Touch target of a thumb (the visible knob is smaller). */
const THUMB_HIT = 44;
const THUMB_VISUAL = 24;
const TRACK_HEIGHT = 4;
/** While dragging, the filter is applied at most this often (and always on release). */
const COMMIT_THROTTLE_MS = 120;
const SETTLE_MS = 120;

export type AmountRangeSliderProps = {
  domain: AmountDomain;
  /** Thumb values in paise, as the filter holds them (a value may sit between two steps). */
  lowPaise: number;
  highPaise: number;
  /** Called while dragging (throttled), on release and on an accessibility adjust. */
  onChange: (lowPaise: number, highPaise: number) => void;
};

function formatPaise(paise: number): string {
  return formatInrCompact(paise / 100);
}

/**
 * Two-thumb range slider over the domain's steps (gesture handler + reanimated, no native module).
 * Only a thumb the user moves is snapped to a step; the other keeps its exact value, and so does a
 * thumb that is merely touched. Each thumb is an adjustable element for screen readers.
 */
export const AmountRangeSlider = memo(function AmountRangeSlider({
  domain,
  lowPaise,
  highPaise,
  onChange,
}: AmountRangeSliderProps) {
  const styles = useStyles();
  const reduceMotion = useReduceMotion();
  const steps = domain.steps;

  // What the labels and screen readers show; follows the thumbs live while dragging.
  const [shown, setShown] = useState({ low: lowPaise, high: highPaise });
  const shownRef = useRef(shown);
  const domainRef = useRef(domain);
  const draggingRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const pendingRef = useRef<{ low: number; high: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmitRef = useRef(0);

  const fracOf = useCallback(
    (paise: number) => (paise - domain.minPaise) / (domain.maxPaise - domain.minPaise),
    [domain.maxPaise, domain.minPaise],
  );
  const lowFrac = useSharedValue(fracOf(lowPaise));
  const highFrac = useSharedValue(fracOf(highPaise));
  const trackWidth = useSharedValue(0);
  const startFrac = useSharedValue(0);
  const lastIndex = useSharedValue(-1);
  const armed = useSharedValue(false);
  const moved = useSharedValue(false);

  useEffect(() => {
    onChangeRef.current = onChange;
    domainRef.current = domain;
  }, [domain, onChange]);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    lastEmitRef.current = Date.now();
    onChangeRef.current(pending.low, pending.high);
  }, []);

  const scheduleEmit = useCallback(
    (low: number, high: number) => {
      pendingRef.current = { low, high };
      if (timerRef.current !== null) return;
      const wait = Math.max(0, COMMIT_THROTTLE_MS - (Date.now() - lastEmitRef.current));
      timerRef.current = setTimeout(flush, wait);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const settle = useCallback(
    (frac: SharedValue<number>, target: number) => {
      frac.value = reduceMotion ? target : withTiming(target, { duration: SETTLE_MS });
    },
    [reduceMotion],
  );

  // A change from outside (Reset, the chip's ✕, another month) moves the thumbs; echoes of our own
  // commits land on the same spots, and nothing is touched while a finger is down.
  useEffect(() => {
    if (draggingRef.current) return;
    shownRef.current = { low: lowPaise, high: highPaise };
    setShown((prev) =>
      prev.low === lowPaise && prev.high === highPaise
        ? prev
        : { low: lowPaise, high: highPaise },
    );
    settle(lowFrac, fracOf(lowPaise));
    settle(highFrac, fracOf(highPaise));
  }, [fracOf, highFrac, highPaise, lowFrac, lowPaise, settle]);

  const beginDrag = useCallback(() => {
    draggingRef.current = true;
  }, []);

  const dragTo = useCallback(
    (which: 0 | 1, index: number) => {
      const value = amountAtIndex(domainRef.current, index);
      const current = shownRef.current;
      const next = which === 0 ? { low: value, high: current.high } : { low: current.low, high: value };
      shownRef.current = next;
      setShown(next);
      scheduleEmit(next.low, next.high);
    },
    [scheduleEmit],
  );

  const endDrag = useCallback(() => {
    draggingRef.current = false;
    flush();
  }, [flush]);

  const nudge = useCallback(
    (which: "low" | "high", direction: 1 | -1) => {
      const current = shownRef.current;
      const next = nudgeAmountThumb(domainRef.current, which, current.low, current.high, direction);
      if (next.low === current.low && next.high === current.high) return;
      shownRef.current = next;
      setShown(next);
      settle(lowFrac, fracOf(next.low));
      settle(highFrac, fracOf(next.high));
      pendingRef.current = next;
      flush();
    },
    [flush, fracOf, highFrac, lowFrac, settle],
  );

  const onRailLayout = useCallback(
    (event: LayoutChangeEvent) => {
      trackWidth.value = Math.max(0, event.nativeEvent.layout.width - THUMB_HIT);
    },
    [trackWidth],
  );

  // Rebuilt only when the scale or the callbacks change, never per render while a finger is down.
  const [lowPan, highPan] = useMemo(() => {
    const makePan = (which: 0 | 1) => {
      const mine = which === 0 ? lowFrac : highFrac;
      const other = which === 0 ? highFrac : lowFrac;
      return Gesture.Pan()
        .minDistance(1)
        .onBegin(() => {
          // Ignore a touch that lands before the rail has been measured.
          if (trackWidth.value <= 0) return;
          armed.value = true;
          moved.value = false;
          startFrac.value = mine.value;
          lastIndex.value = -1;
          runOnJS(beginDrag)();
        })
        .onUpdate((event) => {
          if (!armed.value) return;
          const width = trackWidth.value;
          const gap = 1 / steps;
          const raw = startFrac.value + event.translationX / width;
          const next =
            which === 0
              ? Math.max(0, Math.min(raw, other.value - gap))
              : Math.min(1, Math.max(raw, other.value + gap));
          mine.value = next;
          moved.value = true;
          const index = snapThumbIndex(which, next, other.value, steps);
          if (index !== lastIndex.value) {
            lastIndex.value = index;
            runOnJS(dragTo)(which, index);
          }
        })
        .onFinalize(() => {
          if (!armed.value) return;
          armed.value = false;
          if (moved.value) {
            // Land on the same step the label shows, one step clear of the other thumb.
            const index = snapThumbIndex(which, mine.value, other.value, steps);
            const target = index / steps;
            mine.value = reduceMotion ? target : withTiming(target, { duration: SETTLE_MS });
          }
          runOnJS(endDrag)();
        });
    };
    return [makePan(0), makePan(1)];
  }, [
    armed,
    beginDrag,
    dragTo,
    endDrag,
    highFrac,
    lastIndex,
    lowFrac,
    moved,
    reduceMotion,
    startFrac,
    steps,
    trackWidth,
  ]);

  const lowThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: lowFrac.value * trackWidth.value }],
    // Where the thumbs meet near the right edge, the lower one must stay reachable.
    zIndex: lowFrac.value > 0.5 ? 3 : 1,
  }));
  const highThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: highFrac.value * trackWidth.value }],
    zIndex: 2,
  }));
  const fillStyle = useAnimatedStyle(() => ({
    left: THUMB_HIT / 2 + lowFrac.value * trackWidth.value,
    width: Math.max(0, (highFrac.value - lowFrac.value) * trackWidth.value),
  }));

  const adjust = (which: "low" | "high") => (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "increment") nudge(which, 1);
    else if (event.nativeEvent.actionName === "decrement") nudge(which, -1);
  };
  const actions = [
    { name: "increment", label: "Increase" },
    { name: "decrement", label: "Decrease" },
  ];
  const lowText = formatPaise(shown.low);
  const highText = formatPaise(shown.high);

  return (
    <View>
      <View
        style={styles.values}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View>
          <Text style={styles.caption}>Min</Text>
          <Text style={styles.value}>{lowText}</Text>
        </View>
        <View style={styles.valueEnd}>
          <Text style={styles.caption}>Max</Text>
          <Text style={styles.value}>{highText}</Text>
        </View>
      </View>
      <View style={styles.rail} onLayout={onRailLayout}>
        <View style={styles.track} />
        <Animated.View style={[styles.fill, fillStyle]} />
        <GestureDetector gesture={lowPan}>
          <Animated.View
            style={[styles.thumbHit, lowThumbStyle]}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Minimum amount"
            accessibilityValue={{ text: lowText }}
            accessibilityActions={actions}
            onAccessibilityAction={adjust("low")}
          >
            <View style={styles.thumb} />
          </Animated.View>
        </GestureDetector>
        <GestureDetector gesture={highPan}>
          <Animated.View
            style={[styles.thumbHit, highThumbStyle]}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Maximum amount"
            accessibilityValue={{ text: highText }}
            accessibilityActions={actions}
            onAccessibilityAction={adjust("high")}
          >
            <View style={styles.thumb} />
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  values: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  valueEnd: {
    alignItems: "flex-end",
  },
  caption: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  rail: {
    height: THUMB_HIT,
    justifyContent: "center",
  },
  track: {
    position: "absolute",
    left: THUMB_HIT / 2,
    right: THUMB_HIT / 2,
    top: (THUMB_HIT - TRACK_HEIGHT) / 2,
    height: TRACK_HEIGHT,
    borderRadius: radius.full,
    backgroundColor: colors.line,
  },
  fill: {
    position: "absolute",
    top: (THUMB_HIT - TRACK_HEIGHT) / 2,
    height: TRACK_HEIGHT,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  thumbHit: {
    position: "absolute",
    top: 0,
    left: 0,
    width: THUMB_HIT,
    height: THUMB_HIT,
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: {
    width: THUMB_VISUAL,
    height: THUMB_VISUAL,
    borderRadius: THUMB_VISUAL / 2,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.accent,
    ...shadows.pill,
  },
}));
