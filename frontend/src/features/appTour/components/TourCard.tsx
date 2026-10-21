import { ChevronRight, Play, Trophy } from "lucide-react-native";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Button } from "@/components/ui";
import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { springs } from "@/constants/motion";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";

import type { TourId, TourStep } from "../constants/tourTypes";
import { getTour } from "../constants/tourRegistry";
import type { TourCompletion } from "../store/appTourStore";
import type { TourMotion } from "../utils/tourMotion";
import type { TourCardPlacement } from "../utils/tourPlacement";

import { TourCheckMark } from "./TourCheckMark";
import { resolveTourIcon } from "./tourIcon";
import { TourDimeMark } from "./TourDimeMark";
import { TourProgressBar } from "./TourProgressBar";
import { TourShimmer } from "./TourShimmer";
import { TourTitle } from "./TourTitle";

const ARROW_SIZE = 14;
/** Minimum touch target (dp). */
const MIN_TOUCH = 44;
/** Small slide of the text blocks as they appear (dp). */
const TEXT_SLIDE_DP = 4;
const BADGE_SIZE = 26;
const DEFAULT_HINT = "Try it: tap the highlighted spot";

export type TourCardProps = {
  tourId: TourId;
  /** The step whose content the card shows (it lags the current step while the card is hidden). */
  step: TourStep;
  /** Body to show, already resolved (the retry wording after a wrong turn). */
  body: string;
  /** "Step N of M" position among the numbered steps; null on the welcome and finish cards. */
  actionNumber: number | null;
  actionTotal: number;
  width: number;
  placement: TourCardPlacement;
  /**
   * Shown or hidden. Hiding fades the card out (before the spotlight moves); showing places it
   * at its current position and fades it in (after the spotlight settled).
   */
  visible: boolean;
  motion: TourMotion;
  /** Bumped when the user taps the dimmed area, to nudge the card toward its buttons. */
  nudgeCount: number;
  /** The title, so the overlay can move screen-reader focus to it. */
  titleRef: RefObject<View | null>;
  /** What the finish card of a tab tour reports ("3 of 7 tours done", "Up next"); null otherwise. */
  completion: TourCompletion | null;
  /** The tour can step back from here (not the first step, and not the first-run tour). */
  showBack: boolean;
  onMeasured: (height: number) => void;
  /** Primary button of the steps that move on with a button (and the welcome / finish cards). */
  onNext: () => void;
  onBack: () => void;
  /** Primary button of the steps that wait for the user: does what the glowing target does. */
  onAction: () => void;
  onSkip: () => void;
  /** "Up next" on the finish card: ends this tour and starts that one. */
  onStartNext: (id: TourId) => void;
  /** The card is kept inside these (overlay coordinates), whatever height it turns out to have. */
  minTop: number;
  maxBottom: number;
};

/** The tooltip card: fades in beside the target once the spotlight settled, then points at it. */
export function TourCard({
  tourId,
  step,
  body,
  actionNumber,
  actionTotal,
  width,
  placement,
  visible,
  motion,
  nudgeCount,
  titleRef,
  completion,
  showBack,
  onMeasured,
  onNext,
  onBack,
  onAction,
  onSkip,
  onStartNext,
  minTop,
  maxBottom,
}: TourCardProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const measuredHeightRef = useRef(0);
  const positionedRef = useRef(false);
  // Where the arrow last was (a JS-side mirror: shared values are only ever written from here).
  const arrowRef = useRef(placement.arrowX ?? 0);

  const left = useSharedValue(placement.left);
  const top = useSharedValue(placement.top);
  const arrowX = useSharedValue(placement.arrowX ?? 0);
  const arrowOpacity = useSharedValue(placement.arrowX === null ? 0 : 1);
  const cardOpacity = useSharedValue(0);
  const titleIn = useSharedValue(0);
  const bodyIn = useSharedValue(0);
  const badgeIn = useSharedValue(0);
  const nudge = useSharedValue(1);
  // The card's real height, written on every layout: its position is clamped against it on the UI
  // thread, so a card taller than the estimate the placement used is never cut off.
  const heightSv = useSharedValue(0);

  // Fade in (title, then the rest) when shown; fade out quickly when hidden.
  useEffect(() => {
    if (visible) {
      const inConfig = { duration: motion.cardInMs };
      cardOpacity.value = withTiming(1, inConfig);
      titleIn.value = withTiming(1, inConfig);
      bodyIn.value = withDelay(motion.textStaggerMs, withTiming(1, inConfig));
      badgeIn.value = motion.spring
        ? withDelay(motion.textStaggerMs, withSpring(1, springs.bouncy))
        : withTiming(1, inConfig);
      return;
    }
    positionedRef.current = false;
    const outConfig = { duration: motion.cardOutMs };
    cardOpacity.value = withTiming(0, outConfig);
    titleIn.value = withTiming(0, outConfig);
    bodyIn.value = withTiming(0, outConfig);
    badgeIn.value = withTiming(0, outConfig);
  }, [
    visible,
    motion.spring,
    motion.cardInMs,
    motion.cardOutMs,
    motion.textStaggerMs,
    cardOpacity,
    titleIn,
    bodyIn,
    badgeIn,
  ]);

  // Placement: jump to the spot while hidden-to-visible (the card faded out where it was), then
  // follow the target gently if it moves (scrolling, layout changes).
  useEffect(() => {
    if (!visible) {
      return;
    }
    const targetArrow = placement.arrowX ?? arrowRef.current;
    arrowRef.current = targetArrow;
    if (!positionedRef.current || !motion.spring) {
      positionedRef.current = true;
      left.value = placement.left;
      top.value = placement.top;
      arrowX.value = targetArrow;
    } else {
      left.value = withSpring(placement.left, springs.tourCard);
      top.value = withSpring(placement.top, springs.tourCard);
      arrowX.value = withSpring(targetArrow, springs.tourCard);
    }
    arrowOpacity.value = withTiming(placement.arrowX === null ? 0 : 1, {
      duration: motion.fadeMs,
    });
  }, [
    visible,
    placement.left,
    placement.top,
    placement.arrowX,
    motion.spring,
    motion.fadeMs,
    left,
    top,
    arrowX,
    arrowOpacity,
  ]);

  // A tap on the dimmed area: a small bump so the card reads as "answer me".
  useEffect(() => {
    if (nudgeCount === 0 || !motion.spring) {
      return;
    }
    nudge.value = withSequence(
      withTiming(1.03, { duration: 90 }),
      withSpring(1, springs.bouncy),
    );
  }, [nudgeCount, motion.spring, nudge]);

  // Slides in from the side of the target (the card sits above it: rises from below).
  const slideFrom =
    (placement.side === "below" ? -1 : 1) * motion.cardSlideDp;

  const cardStyle = useAnimatedStyle(() => ({
    left: left.value,
    top:
      heightSv.value > 0
        ? Math.max(minTop, Math.min(top.value, maxBottom - heightSv.value))
        : top.value,
    opacity: cardOpacity.value,
    transform: [
      { translateY: (1 - cardOpacity.value) * slideFrom },
      { scale: nudge.value },
    ],
  }));
  const arrowStyle = useAnimatedStyle(() => ({
    left: arrowX.value - ARROW_SIZE / 2,
    opacity: arrowOpacity.value,
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleIn.value,
    transform: [
      {
        translateY: motion.cardSlideDp > 0 ? (1 - titleIn.value) * TEXT_SLIDE_DP : 0,
      },
    ],
  }));
  const bodyStyle = useAnimatedStyle(() => ({
    opacity: bodyIn.value,
    transform: [
      {
        translateY: motion.cardSlideDp > 0 ? (1 - bodyIn.value) * TEXT_SLIDE_DP : 0,
      },
    ],
  }));
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, badgeIn.value * 1.6),
    transform: [{ scale: 0.5 + badgeIn.value * 0.5 }],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    heightSv.value = height;
    if (Math.abs(height - measuredHeightRef.current) > 0.5) {
      measuredHeightRef.current = height;
      onMeasured(height);
    }
  };

  const isHero = step.kind === "welcome" || step.kind === "finale";
  const isFinale = step.kind === "finale";
  const isDo = step.kind === "do";
  const progressLabel =
    actionNumber === null ? null : `Step ${actionNumber} of ${actionTotal}`;
  const primaryLabel = step.primaryLabel ?? "Next";
  const arrowOnTop = placement.side === "below";
  const showArrow = placement.side === "above" || placement.side === "below";
  const StepIcon = step.icon ? resolveTourIcon(step.icon) : undefined;
  const nextTour = completion?.nextTourId ? getTour(completion.nextTourId) : null;

  const primary = isDo
    ? { label: step.actionLabel ?? "Do it for me", onPress: onAction }
    : { label: primaryLabel, onPress: onNext };

  const titleTextStyle = StyleSheet.flatten([
    styles.title,
    isHero && styles.centered,
  ]);

  return (
    <Animated.View
      style={[styles.card, { width }, cardStyle]}
      onLayout={onLayout}
      pointerEvents={visible ? "auto" : "none"}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      accessibilityElementsHidden={!visible}
      accessibilityViewIsModal
    >
      {showArrow ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.arrow,
            arrowOnTop ? styles.arrowOnTop : styles.arrowOnBottom,
            arrowStyle,
          ]}
        />
      ) : null}

      {isHero ? (
        <View style={styles.heroMark}>
          {isFinale ? (
            <TourCheckMark play={visible} motion={motion} />
          ) : (
            <TourDimeMark motion={motion} />
          )}
        </View>
      ) : (
        <View>
          <View style={styles.headerRow}>
            <View style={styles.eyebrowRow}>
              {StepIcon ? (
                <Animated.View style={[styles.badge, badgeStyle]}>
                  <StepIcon size={14} color={colors.accentText} strokeWidth={2.2} />
                </Animated.View>
              ) : null}
              <Text style={styles.eyebrow}>{progressLabel}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip tour"
              hitSlop={8}
              style={styles.skipTour}
              onPress={() => {
                void triggerHaptic();
                onSkip();
              }}
            >
              <Text style={styles.skip}>{step.skipLabel ?? "Skip tour"}</Text>
            </Pressable>
          </View>
          <TourProgressBar
            count={actionTotal}
            current={actionNumber ?? 0}
            motion={motion}
          />
        </View>
      )}

      <Animated.View style={motion.wordFade ? undefined : titleStyle}>
        {motion.wordFade ? (
          <TourTitle
            text={step.title}
            play={visible}
            motion={motion}
            style={titleTextStyle}
            titleRef={titleRef}
          />
        ) : (
          <View ref={titleRef} accessible accessibilityRole="header">
            <Text style={[styles.title, isHero && styles.centered]}>
              {step.title}
            </Text>
          </View>
        )}
      </Animated.View>

      <Animated.View style={bodyStyle}>
        <Text style={[styles.body, isHero && styles.centered]}>{body}</Text>

        {isDo ? (
          <View style={styles.hintChip}>
            <View style={styles.hintDot} />
            <Text style={styles.hintText}>{step.hint ?? DEFAULT_HINT}</Text>
          </View>
        ) : null}

        {completion ? (
          <View style={styles.finaleBlock}>
            <Text style={styles.doneCount}>
              {completion.seenCount} of {completion.total} tours done
            </Text>
            <TourProgressBar
              count={completion.total}
              current={
                visible
                  ? completion.seenCount
                  : completion.seenCount - (completion.firstTime ? 1 : 0)
              }
              motion={motion}
            />
            {completion.allDone ? (
              <MasterRow motion={motion} />
            ) : nextTour ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Up next: ${nextTour.title} tour, ${nextTour.durationLabel}`}
                onPress={() => {
                  void triggerHaptic();
                  onStartNext(nextTour.id);
                }}
                style={({ pressed }) => [styles.nextChip, pressed && styles.nextChipPressed]}
              >
                <Play size={12} color={colors.accentText} strokeWidth={2.4} />
                <Text style={styles.nextChipText} numberOfLines={1}>
                  Up next: {nextTour.title}
                </Text>
                <ChevronRight size={14} color={colors.accentText} strokeWidth={2.4} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View
          style={
            isHero
              ? styles.stackedActions
              : showBack
                ? styles.actionsWithBack
                : styles.actions
          }
        >
          {showBack && !isHero ? (
            <Button
              title="Back"
              variant="ghost"
              onPress={onBack}
              accessibilityLabel="Back"
            />
          ) : null}
          <View style={showBack && !isHero ? styles.primarySlot : undefined}>
            <Button
              title={primary.label}
              onPress={primary.onPress}
              accessibilityLabel={
                progressLabel
                  ? `${primary.label}, ${progressLabel}`
                  : primary.label
              }
            />
          </View>
          {step.kind === "welcome" ? (
            <Pressable
              accessibilityRole="button"
              onPress={onSkip}
              hitSlop={8}
              style={({ pressed }) => [
                styles.skipLink,
                pressed && styles.skipLinkPressed,
              ]}
            >
              <Text style={styles.skipLinkLabel}>{step.skipLabel ?? "Not now"}</Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/** "Tour master": shown on the finish card of the tour that completed the set. */
function MasterRow({ motion }: { motion: TourMotion }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  return (
    <View
      accessible
      accessibilityLabel="You are a Tour master"
      style={styles.masterRow}
      onLayout={(event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        setSize({ width, height });
      }}
    >
      <Trophy size={16} color={colors.accentText} strokeWidth={2.2} />
      <Text style={styles.masterText}>You&apos;re a Tour master!</Text>
      {motion.ripple && size.width > 0 ? (
        <TourShimmer
          width={size.width}
          height={size.height}
          cornerRadius={radius.full}
          color={colors.surface}
          playKey={1}
          delayMs={500}
          durationMs={900}
        />
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  card: {
    position: "absolute",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.xl - spacing.xs,
    ...shadows.modal,
  },
  arrow: {
    position: "absolute",
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    transform: [{ rotate: "45deg" }],
  },
  arrowOnTop: {
    top: -(ARROW_SIZE / 2) - 1,
    borderTopWidth: 1,
    borderLeftWidth: 1,
  },
  arrowOnBottom: {
    bottom: -(ARROW_SIZE / 2) - 1,
    borderBottomWidth: 1,
    borderRightWidth: 1,
  },
  heroMark: {
    alignItems: "center",
    marginTop: -spacing.sm,
    marginBottom: spacing.xs,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 1,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentTint,
  },
  eyebrow: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.66,
    textTransform: "uppercase",
    color: colors.accentText,
  },
  skipTour: {
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  skip: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  title: {
    marginTop: spacing.sm,
    fontFamily: fontFamilies.semiBold,
    fontSize: 21,
    lineHeight: 27,
    letterSpacing: -0.21,
    color: colors.ink,
  },
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
    marginTop: spacing.xs + 2,
  },
  centered: {
    textAlign: "center",
  },
  hintChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.accentTint,
  },
  hintDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentText,
  },
  hintText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.accentText,
  },
  finaleBlock: {
    marginTop: spacing.lg,
    gap: spacing.sm,
    alignItems: "stretch",
  },
  doneCount: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
    textAlign: "center",
    color: colors.inkSoft,
  },
  nextChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: spacing.sm,
    minHeight: MIN_TOUCH,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.accentTint,
  },
  nextChipPressed: {
    opacity: 0.75,
  },
  nextChipText: {
    flexShrink: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.accentText,
  },
  masterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.accentTint,
    overflow: "hidden",
  },
  masterText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.accentText,
  },
  actions: {
    marginTop: spacing.md,
  },
  actionsWithBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primarySlot: {
    flex: 1,
  },
  stackedActions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  skipLink: {
    alignSelf: "center",
    minHeight: MIN_TOUCH,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  skipLinkPressed: {
    opacity: 0.7,
  },
  skipLinkLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
}));
