import { Lightbulb } from "lucide-react-native";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { fontFamilies } from "@/constants/fonts";
import { springs } from "@/constants/motion";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { useAppTourStore } from "@/features/appTour/store/appTourStore";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import {
  hasSeenFirstUseTip,
  markFirstUseTipSeen,
  subscribeFirstUseTips,
  type FirstUseTipId,
} from "@/lib/onboarding/firstUseTipStorage";
import { createThemedStyles, useTheme } from "@/theme";

const FADE_MS = 180;
const START_SCALE = 0.96;

export type FirstUseTipProps = {
  tipId: FirstUseTipId;
  /** One short line. */
  message: string;
  /** Optional second action ("Show me"); tapping it dismisses the tip too. */
  actionLabel?: string;
  onAction?: () => void;
  /** Extra gate from the host (for example, until its screen is focused). */
  enabled?: boolean;
  /** Waits for another tip to be dismissed first, so two tips on one screen show one after the other. */
  after?: FirstUseTipId;
  /** For tips inside a modal or overlay: closing the host counts as seen, so the tip never nags. */
  seenOnUnmount?: boolean;
  /** Reserved for the feature clips of Phase 3; nothing renders here yet. */
  media?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * A small card with one line of help, shown once per device the first time a feature is opened.
 * It springs in (fade only under reduced motion), is announced to screen readers, never shows while
 * the guided tour runs, and stays gone once dismissed.
 */
export const FirstUseTip = memo(function FirstUseTip({
  tipId,
  message,
  actionLabel,
  onAction,
  enabled = true,
  after,
  seenOnUnmount = false,
  style,
}: FirstUseTipProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const tourActive = useAppTourStore((s) => s.active);
  const dismissed = useSyncExternalStore(subscribeFirstUseTips, () =>
    hasSeenFirstUseTip(tipId),
  );
  const waiting = useSyncExternalStore(
    subscribeFirstUseTips,
    () => after !== undefined && !hasSeenFirstUseTip(after),
  );
  const show = enabled && !tourActive && !dismissed && !waiting;
  const enter = useSharedValue(0);

  useEffect(() => {
    if (!show) {
      return;
    }
    enter.value = reduceMotion
      ? withTiming(1, { duration: FADE_MS })
      : withSpring(1, springs.smooth);
    AccessibilityInfo.announceForAccessibility(message);
    return () => {
      enter.value = 0;
    };
  }, [show, reduceMotion, message, enter]);

  // Seen when the host (a modal) closes while the tip was on screen, not when the tip merely hides
  // (the tour starting, the host's `enabled` flipping): only the unmount counts.
  const unmountRef = useRef({ shown: false, seenOnUnmount, tipId });
  useEffect(() => {
    unmountRef.current = { shown: unmountRef.current.shown || show, seenOnUnmount, tipId };
  }, [show, seenOnUnmount, tipId]);
  useEffect(
    () => () => {
      const { shown, seenOnUnmount: markOnUnmount, tipId: id } = unmountRef.current;
      if (shown && markOnUnmount) {
        markFirstUseTipSeen(id);
      }
    },
    [],
  );

  const dismiss = useCallback(() => {
    markFirstUseTipSeen(tipId);
  }, [tipId]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 1.4),
    transform: [
      { scale: reduceMotion ? 1 : START_SCALE + enter.value * (1 - START_SCALE) },
    ],
  }));

  if (!show) {
    return null;
  }

  return (
    <Animated.View style={[styles.card, animatedStyle, style]}>
      <View style={styles.top}>
        <Lightbulb size={18} color={colors.accentText} strokeWidth={2} />
        <Text style={styles.message}>{message}</Text>
      </View>
      <View style={styles.actions}>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={() => {
              dismiss();
              onAction();
            }}
            hitSlop={6}
            style={styles.button}
          >
            <Text style={styles.actionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Got it"
          onPress={dismiss}
          hitSlop={6}
          style={styles.button}
        >
          <Text style={styles.dismissText}>Got it</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  card: {
    backgroundColor: colors.accentTint,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingRight: spacing.xs,
  },
  message: {
    flex: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.xs,
  },
  button: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  actionText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.accentText,
  },
  dismissText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
}));
