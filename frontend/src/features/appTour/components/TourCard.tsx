import { useEffect, useRef } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Button } from "@/components/ui";
import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { springs } from "@/constants/motion";
import { createThemedStyles } from "@/theme";

import type { TourStep } from "../constants/tourSteps";
import type { TourCardPlacement } from "../utils/tourPlacement";
import type { TourMotion } from "../utils/tourMotion";

import { TourDimeMark } from "./TourDimeMark";
import { TourProgressDots } from "./TourProgressDots";

const ARROW_SIZE = 14;

export type TourCardProps = {
  step: TourStep;
  index: number;
  total: number;
  width: number;
  placement: TourCardPlacement;
  /**
   * False while the step's target is still being located: the card keeps its previous position
   * (instead of flashing at the screen center) and moves once the target is known.
   */
  settled: boolean;
  motion: TourMotion;
  /** The screens behind the card are showing sample data, not the user's own. */
  showSampleBadge?: boolean;
  /** Bumped when the user taps the dimmed area, to nudge the card toward its buttons. */
  nudgeCount: number;
  onMeasured: (height: number) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  /** Finale call to action. */
  onFinaleAction: () => void;
};

/** Marks the screens behind the card as sample data (an empty account's preview). */
function SampleDataBadge() {
  const styles = useStyles();
  return (
    <View style={styles.sampleBadge}>
      <Text style={styles.sampleBadgeText}>Sample data</Text>
    </View>
  );
}

/** The tooltip card: springs in, glides to each target, and points at it with an arrow. */
export function TourCard({
  step,
  index,
  total,
  width,
  placement,
  settled,
  motion,
  showSampleBadge = false,
  nudgeCount,
  onMeasured,
  onNext,
  onBack,
  onSkip,
  onFinaleAction,
}: TourCardProps) {
  const styles = useStyles();
  const measuredHeightRef = useRef(0);

  const left = useSharedValue(placement.left);
  const top = useSharedValue(placement.top);
  const arrowX = useSharedValue(placement.arrowX ?? 0);
  const arrowOpacity = useSharedValue(placement.arrowX === null ? 0 : 1);
  const enter = useSharedValue(0);
  const nudge = useSharedValue(1);

  // Pop in once.
  useEffect(() => {
    enter.value = motion.spring
      ? withSpring(1, springs.tourCard)
      : withTiming(1, { duration: motion.fadeMs });
  }, [enter, motion.spring, motion.fadeMs]);

  // Glide to wherever the target now is.
  useEffect(() => {
    if (!settled) {
      arrowOpacity.value = withTiming(0, { duration: motion.fadeMs });
      return;
    }
    if (motion.spring) {
      left.value = withSpring(placement.left, springs.tourCard);
      top.value = withSpring(placement.top, springs.tourCard);
      arrowX.value = withSpring(placement.arrowX ?? arrowX.value, springs.tourCard);
    } else {
      left.value = placement.left;
      top.value = placement.top;
      arrowX.value = placement.arrowX ?? arrowX.value;
    }
    arrowOpacity.value = withTiming(placement.arrowX === null ? 0 : 1, {
      duration: motion.fadeMs,
    });
  }, [
    settled,
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

  const cardStyle = useAnimatedStyle(() => ({
    left: left.value,
    top: top.value,
    opacity: enter.value,
    transform: [
      { scale: (motion.spring ? 0.92 + enter.value * 0.08 : 1) * nudge.value },
    ],
  }));
  const arrowStyle = useAnimatedStyle(() => ({
    left: arrowX.value - ARROW_SIZE / 2,
    opacity: arrowOpacity.value,
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (Math.abs(height - measuredHeightRef.current) > 0.5) {
      measuredHeightRef.current = height;
      onMeasured(height);
    }
  };

  const isHero = step.kind !== "spotlight";
  const isFirst = index === 0;
  const progressLabel = `Step ${index + 1} of ${total}`;
  const primaryLabel = step.primaryLabel ?? "Next";
  const arrowOnTop = placement.side === "below";
  const showArrow = placement.side === "above" || placement.side === "below";

  return (
    <Animated.View
      style={[styles.card, { width }, cardStyle]}
      onLayout={onLayout}
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

      <Animated.View
        key={step.id}
        entering={
          motion.spring
            ? FadeInDown.duration(240)
            : FadeIn.duration(motion.fadeMs)
        }
        accessibilityLiveRegion="polite"
      >
        {isHero ? (
          <View style={styles.heroMark}>
            <TourDimeMark motion={motion} />
          </View>
        ) : (
          <View style={styles.headerRow}>
            <View style={styles.eyebrowGroup}>
              <Text style={styles.eyebrow}>{progressLabel}</Text>
              {showSampleBadge ? <SampleDataBadge /> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip tour"
              hitSlop={12}
              onPress={onSkip}
            >
              <Text style={styles.skip}>Skip tour</Text>
            </Pressable>
          </View>
        )}

        {showSampleBadge && step.kind === "finale" ? (
          <View style={styles.finaleBadge}>
            <SampleDataBadge />
          </View>
        ) : null}

        <Text
          accessibilityRole="header"
          style={[styles.title, isHero && styles.centered]}
        >
          {step.title}
        </Text>
        <Text style={[styles.body, isHero && styles.centered]}>{step.body}</Text>

        {step.interaction === "tapTarget" ? (
          <View style={styles.hintChip}>
            <View style={styles.hintDot} />
            <Text style={styles.hintText}>Try it: tap the glowing button</Text>
          </View>
        ) : null}
      </Animated.View>

      {!isHero ? (
        <View style={styles.dotsRow}>
          <TourProgressDots count={total} index={index} motion={motion} />
        </View>
      ) : null}

      {step.kind === "welcome" ? (
        <View style={styles.stackedActions}>
          <Button title={primaryLabel} onPress={onNext} />
          <Pressable
            accessibilityRole="button"
            onPress={onSkip}
            hitSlop={8}
            style={({ pressed }) => [styles.skipLink, pressed && styles.skipLinkPressed]}
          >
            <Text style={styles.skipLinkLabel}>{step.skipLabel ?? "Skip"}</Text>
          </Pressable>
        </View>
      ) : step.kind === "finale" ? (
        <View style={styles.stackedActions}>
          <Button title={primaryLabel} onPress={onFinaleAction} />
          <Pressable
            accessibilityRole="button"
            onPress={onNext}
            hitSlop={8}
            style={({ pressed }) => [styles.skipLink, pressed && styles.skipLinkPressed]}
          >
            <Text style={styles.skipLinkLabel}>{step.skipLabel ?? "Done"}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actionsRow}>
          {!isFirst ? (
            <View style={styles.backSlot}>
              <Button
                title="Back"
                variant="secondary"
                onPress={onBack}
                accessibilityLabel={`Back to step ${index}`}
              />
            </View>
          ) : null}
          <View style={styles.nextSlot}>
            <Button
              title={primaryLabel}
              onPress={onNext}
              accessibilityLabel={`${primaryLabel}, ${progressLabel}`}
            />
          </View>
        </View>
      )}
    </Animated.View>
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
    marginBottom: spacing.sm,
  },
  eyebrowGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 1,
  },
  sampleBadge: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.accentTint,
  },
  sampleBadgeText: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    color: colors.accentText,
  },
  finaleBadge: {
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  eyebrow: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.66,
    textTransform: "uppercase",
    color: colors.accentText,
  },
  skip: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  title: {
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
  dotsRow: {
    marginTop: spacing.lg,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  backSlot: {
    flex: 1,
  },
  nextSlot: {
    flex: 2,
  },
  stackedActions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  skipLink: {
    alignSelf: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
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
