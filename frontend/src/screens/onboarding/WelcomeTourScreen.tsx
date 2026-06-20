import { ArrowLeft } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StackScreenShell } from "@/components/layout/StackScreenShell";
import {
  accent,
  ink,
  inkFaint,
  inkSoft,
  paper,
  radius,
  spacing,
  surface,
  surfaceSunken,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { iconSizes } from "@/constants/iconSizes";
import {
  AuthFeatureCarousel,
  AuthPostcardDots,
} from "@/features/onboarding/components";
import { AUTH_FEATURE_SLIDES } from "@/features/onboarding/constants/authFeatureSlides";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { useWelcomeTourStore } from "@/stores/welcomeTourStore";

export default function WelcomeTourScreen() {
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
      <View style={[styles.screen, { paddingTop: insets.top }]}>
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
              color={isFirstSlide ? inkFaint : ink}
              strokeWidth={2.25}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isLastSlide ? "Get started" : "Continue"}
            onPress={handlePrimaryPress}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonLabel}>
              {isLastSlide ? "Get started" : "Continue"}
            </Text>
          </Pressable>
        </View>
      </View>
    </StackScreenShell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    flex: 1,
    backgroundColor: paper,
  },
  screen: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
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
    color: inkSoft,
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
    backgroundColor: surfaceSunken,
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
  primaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: accent,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  primaryButtonLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: surface,
  },
});
