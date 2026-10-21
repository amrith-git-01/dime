import { CircleQuestionMark } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { springs } from "@/constants/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";

import type { TourId } from "../constants/tourTypes";
import { useFocusedTourTab, useTourProgress } from "../hooks/useTourProgress";
import { useAppTourStore } from "../store/appTourStore";
import { launchTour } from "../utils/launchTour";
import { resolveTourHelpFab } from "../utils/helpFabVisibility";

const SIZE = 36;
const DOT_SIZE = 10;
const POP_MS = 220;

export type TourHelpFabProps = {
  /** The host's own gate (the Ask AI button's visibility rule: hidden while its chat or the + menu is open). */
  visible: boolean;
  right: number;
  bottom: number;
};

/**
 * The small "?" above the Ask AI button: an attention dot and a gentle pulse ring until the
 * focused tab's tour has been watched or skipped, then it folds away. Tapping it starts that tab's tour.
 */
export function TourHelpFab({ visible, right, bottom }: TourHelpFabProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const tab = useFocusedTourTab();
  const { seen: seenNow } = useTourProgress();
  const tourActive = useAppTourStore((s) => s.active);
  // While a tour runs the button keeps believing what was true when it started, so it folds away
  // (or appears, after the first-run tour) when the tour ends, in front of the user.
  const [frozenSeen, setFrozenSeen] = useState<ReadonlySet<TourId> | null>(null);
  useEffect(() => {
    setFrozenSeen((previous) => (tourActive ? (previous ?? seenNow) : null));
  }, [tourActive, seenNow]);
  const seen = tourActive ? (frozenSeen ?? seenNow) : seenNow;
  const { show, tourId } = resolveTourHelpFab({ tab, seen });
  const wanted = show && visible;

  const [mounted, setMounted] = useState(false);
  const shown = useSharedValue(0);
  const pulse = useSharedValue(0);
  const lastTourIdRef = useRef(tourId);
  const wasWantedRef = useRef(false);
  // A fade-out that finishes after the button was wanted again (on a cold start it renders unwanted
  // for a moment first) must not unmount it.
  const unmountIfStillUnwanted = useCallback(() => {
    if (!wasWantedRef.current) {
      setMounted(false);
    }
  }, []);

  useEffect(() => {
    const folding =
      wasWantedRef.current &&
      !wanted &&
      lastTourIdRef.current === tourId &&
      tourId !== null &&
      seen.has(tourId);
    wasWantedRef.current = wanted;
    lastTourIdRef.current = tourId;

    if (wanted) {
      setMounted(true);
      shown.value = reduceMotion
        ? withTiming(1, { duration: POP_MS })
        : withSpring(1, springs.bouncy);
      return;
    }
    const hidden = (finished?: boolean) => {
      "worklet";
      if (finished) {
        runOnJS(unmountIfStillUnwanted)();
      }
    };
    if (folding && !reduceMotion) {
      // Its tour was just seen: a little pop, then it folds away.
      shown.value = withSequence(
        withTiming(1.18, { duration: 120 }),
        withTiming(0, { duration: 260, easing: Easing.in(Easing.back(1.6)) }, hidden),
      );
    } else {
      shown.value = withTiming(0, { duration: 160 }, hidden);
    }
  }, [wanted, tourId, seen, reduceMotion, shown, unmountIfStillUnwanted]);

  // The pulse ring breathes while the button waits to be noticed.
  useEffect(() => {
    if (!wanted || reduceMotion) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 1700, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [wanted, reduceMotion, pulse]);

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, shown.value) * 1.5),
    transform: [
      { scale: Math.max(0, shown.value) },
      { rotate: `${(1 - Math.min(1, shown.value)) * 90}deg` },
    ],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - pulse.value) * 0.45,
    transform: [{ scale: 1 + pulse.value * 0.7 }],
  }));

  if (!mounted || tourId === null) {
    return null;
  }

  return (
    // Never in view while a tour runs (it would sit on top of the dim layer); it folds away after.
    <View
      pointerEvents={wanted && !tourActive ? "box-none" : "none"}
      style={[styles.slot, { right, bottom, opacity: tourActive ? 0 : 1 }]}
    >
      <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
      {/* The Pressable keeps its full size while the button pops in or folds away (only the drawing
          inside scales), so a tap lands as soon as the button is on screen. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Take a tour of this screen"
        hitSlop={8}
        onPress={() => {
          void triggerHaptic();
          launchTour(tourId);
        }}
        style={({ pressed }) => [styles.hit, pressed && styles.hitPressed]}
      >
        <Animated.View style={[styles.button, buttonStyle]}>
          <CircleQuestionMark size={20} color={colors.accentText} strokeWidth={2} />
          <View style={styles.dot} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  slot: {
    position: "absolute",
    zIndex: 40,
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  hit: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  hitPressed: {
    opacity: 0.9,
  },
  ring: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    borderColor: colors.accentText,
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    ...shadows.fab,
  },
  dot: {
    position: "absolute",
    top: 1,
    right: 1,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.surface,
  },
}));
