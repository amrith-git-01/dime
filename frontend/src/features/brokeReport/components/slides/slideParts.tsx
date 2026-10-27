import { memo, type ReactNode } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ReportTone } from "@/constants/reportPalette";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { tabularNums } from "@/constants/typography";
import {
  easeOut,
  easeOutBack,
  lerp,
  seg,
} from "@/utils/clockMotion";
import { useClockValue } from "@/hooks/useClockValue";
import { createThemedStyles } from "@/theme";

import type { ResolvedCopy } from "../../copy";
import type { ReportSnapshot } from "../../types";

/** What every slide receives. `clock` is ms since the slide started; `initialMs` its start value. */
export type SlideProps = {
  snapshot: ReportSnapshot;
  copy: ResolvedCopy;
  tone: ReportTone;
  clock: SharedValue<number>;
  /** 0 to play, the end of the timeline for the final frame (reduced motion, screen reader). */
  initialMs: number;
  /** The cover shows a SAMPLE badge for the bundled preview. */
  isSample?: boolean;
  /** The final frame is on screen and nothing moves: no confetti, no loops. */
  staticFrames: boolean;
};

/** Room the player's top controls (progress bar and close) take above every slide. */
export const TOP_CHROME = 64;
/** Room the footer (closing controls, accessible next/previous) takes below every slide. */
export const BOTTOM_CHROME = 88;

export const SLIDE_PADDING_H = spacing.xl;

/** Slide text keeps a firm cap on system font scaling: the layouts are full-screen compositions. */
export function SlideText(props: TextProps) {
  return <Text maxFontSizeMultiplier={1.15} {...props} />;
}

/** Fills the screen with the tone and pads for the player's chrome and the safe area. */
export function SlideFrame({
  tone,
  accessibilityLabel,
  children,
  contentStyle,
  extraBottom = 0,
}: {
  tone: ReportTone;
  accessibilityLabel: string;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** More room under the content, for a slide with its own footer (the closing controls). */
  extraBottom?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: tone.bg }]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={accessibilityLabel}
    >
      <View
        style={[
          styles.frame,
          {
            paddingTop: insets.top + TOP_CHROME,
            paddingBottom: insets.bottom + BOTTOM_CHROME + extraBottom,
          },
          contentStyle,
        ]}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {children}
      </View>
    </View>
  );
}

/**
 * Fades and rises into place, driven by the slide clock (so a held slide holds its animation too).
 * `pop` overshoots slightly: for the hero number and confirmations, nothing else.
 */
export const Reveal = memo(function Reveal({
  clock,
  start,
  ms = 450,
  dy = 18,
  pop = false,
  style,
  children,
}: {
  clock: SharedValue<number>;
  start: number;
  ms?: number;
  dy?: number;
  pop?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const animated = useAnimatedStyle(() => {
    const t = seg(clock.value, start, start + ms);
    const p = easeOut(t);
    if (pop) {
      const scale = lerp(0.7, 1, easeOutBack(t));
      return { opacity: p, transform: [{ scale }] };
    }
    return { opacity: p, transform: [{ translateY: (1 - p) * dy }] };
  });
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
});

/** Quantized count-up of a number; the text only re-renders when the shown value changes. */
export const CountText = memo(function CountText({
  clock,
  initialMs,
  to,
  start = 200,
  end = 1300,
  format,
  style,
  numberOfLines = 1,
  fit = true,
}: {
  clock: SharedValue<number>;
  initialMs: number;
  to: number;
  start?: number;
  end?: number;
  format: (value: number) => string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  fit?: boolean;
}) {
  const value = useClockValue(
    clock,
    (ms) => {
      "worklet";
      return Math.round(to * easeOut(seg(ms, start, end)));
    },
    initialMs,
  );
  return (
    <SlideText
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={fit}
      style={[styles.countNums, style]}
    >
      {format(value)}
    </SlideText>
  );
});

/** Small uppercase line above a hero. */
export function Kicker({ tone, children }: { tone: ReportTone; children: string }) {
  const local = useStyles();
  return (
    <SlideText style={[local.kicker, { color: tone.textSoft }]} numberOfLines={2}>
      {children}
    </SlideText>
  );
}

/** The supporting line under a hero. */
export function SupportLine({
  tone,
  children,
  strong = false,
}: {
  tone: ReportTone;
  children: string;
  strong?: boolean;
}) {
  const local = useStyles();
  return (
    <SlideText
      style={[local.support, strong && local.supportStrong, { color: tone.text }]}
    >
      {children}
    </SlideText>
  );
}

/** A rounded chip on the tone's panel. */
export function Chip({
  tone,
  children,
  filled = false,
  fillTone,
  icon,
}: {
  tone: ReportTone;
  children: string;
  filled?: boolean;
  /** Fill from another tone's highlight (e.g. a good-news chip on a warm slide). */
  fillTone?: ReportTone;
  icon?: ReactNode;
}) {
  const local = useStyles();
  const fill = fillTone ?? tone;
  return (
    <View
      style={[
        local.chip,
        { backgroundColor: filled ? fill.highlight : tone.panel },
      ]}
    >
      {icon}
      <SlideText
        style={[local.chipText, { color: filled ? fill.onHighlight : tone.text }]}
        numberOfLines={2}
      >
        {children}
      </SlideText>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    paddingHorizontal: SLIDE_PADDING_H,
    justifyContent: "center",
  },
  countNums: {
    fontVariant: tabularNums,
  },
});

const useStyles = createThemedStyles(() => ({
  kicker: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  support: {
    fontFamily: fontFamilies.medium,
    fontSize: 20,
    lineHeight: 28,
    marginTop: spacing.lg,
  },
  supportStrong: {
    fontFamily: fontFamilies.semiBold,
  },
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    marginTop: spacing.lg,
  },
  chipText: {
    flexShrink: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
  },
}));

/** Shared hero type: one giant number or word per slide. */
export const heroStyles = StyleSheet.create({
  hero: {
    fontFamily: fontFamilies.bold,
    fontSize: 84,
    lineHeight: 92,
    letterSpacing: -2.5,
  },
  heroWord: {
    fontFamily: fontFamilies.bold,
    fontSize: 56,
    lineHeight: 62,
    letterSpacing: -1.5,
  },
});
