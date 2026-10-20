import { ArrowLeft } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StackScreenShell } from "@/components/layout/StackScreenShell";
import { Button } from "@/components/ui";
import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { iconSizes } from "@/constants/iconSizes";
import {
  AuthFeatureCarousel,
  AuthPostcardDots,
} from "@/features/onboarding/components";
import { AUTH_FEATURE_SLIDES } from "@/features/onboarding/constants/authFeatureSlides";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { useWelcomeTourStore } from "@/stores/welcomeTourStore";
import { createThemedStyles, useTheme } from "@/theme";

export default function WelcomeTourScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const completeWelcomeTour = useWelcomeTourStore((s) => s.completeWelcomeTour);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  const finishTour = useCallback(() => {
    void triggerHaptic();
    completeWelcomeTour();
  }, [completeWelcomeTour]);

  const isFirstSlide = activeSlideIndex === 0;
  const isLastSlide = activeSlideIndex === AUTH_FEATURE_SLIDES.length - 1;

  const handleBackPress = useCallback(() => {
    if (isFirstSlide) return;
    void triggerHaptic();
    setActiveSlideIndex((index) => Math.max(index - 1, 0));
  }, [isFirstSlide]);

  const handlePrimaryPress = useCallback(() => {
    void triggerHaptic();
    if (isLastSlide) {
      completeWelcomeTour();
      return;
    }
    setActiveSlideIndex((index) =>
      Math.min(index + 1, AUTH_FEATURE_SLIDES.length - 1),
    );
  }, [completeWelcomeTour, isLastSlide]);

  return (
    <StackScreenShell
      scrollEnabled={false}
      contentContainerStyle={styles.shellContent}
    >
      <View
        style={[
          styles.screen,
          { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip welcome tour"
            onPress={finishTour}
            hitSlop={8}
            style={({ pressed }) => [
              styles.skipButton,
              pressed && styles.skipButtonPressed,
            ]}
          >
            <Text style={styles.skipLabel}>Skip</Text>
          </Pressable>
        </View>

        <View style={styles.carouselRegion}>
          <AuthFeatureCarousel activeIndex={activeSlideIndex} />
        </View>

        <View style={styles.dotsRegion}>
          <AuthPostcardDots
            count={AUTH_FEATURE_SLIDES.length}
            activeIndex={activeSlideIndex}
          />
        </View>

        <View style={styles.ctaRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous slide"
            accessibilityState={{ disabled: isFirstSlide }}
            onPress={handleBackPress}
            disabled={isFirstSlide}
            hitSlop={8}
            style={({ pressed }) => [
              styles.backButton,
              isFirstSlide && styles.backButtonDisabled,
              pressed && !isFirstSlide && styles.backButtonPressed,
            ]}
          >
            <ArrowLeft
              size={iconSizes.nav}
              color={isFirstSlide ? colors.inkFaint : colors.ink}
              strokeWidth={2.25}
            />
          </Pressable>

          <View style={styles.primarySlot}>
            <Button
              title={isLastSlide ? "Get started" : "Continue"}
              accessibilityLabel={isLastSlide ? "Get started" : "Continue"}
              onPress={handlePrimaryPress}
            />
          </View>
        </View>
      </View>
    </StackScreenShell>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  shellContent: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  screen: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    minHeight: 44,
    marginBottom: spacing.xs,
  },
  skipButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  skipButtonPressed: {
    opacity: 0.7,
  },
  skipLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  carouselRegion: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  dotsRegion: {
    marginTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  backButton: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonDisabled: {
    opacity: 0.45,
  },
  backButtonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
  primarySlot: {
    flex: 1,
  },
}));
