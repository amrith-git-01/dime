import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { StackScreenShell } from "@/components/layout/StackScreenShell";
import { bento, colors, radius, shadows, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import {
  AuthFeatureCarousel,
  AuthPostcardDots,
} from "@/features/onboarding/components";
import { AUTH_FEATURE_SLIDES } from "@/features/onboarding/constants/authFeatureSlides";
import {
  ONBOARDING_CTA_TOP_GAP,
  ONBOARDING_DOT_PAGER_GAP,
} from "@/features/onboarding/constants/onboardingTokens";

import { useAuthScreenModel } from "./useAuthScreenModel";

export default function AuthScreen() {
  const model = useAuthScreenModel();
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const handleActiveIndexChange = useCallback((index: number) => {
    setActiveSlideIndex(index);
  }, []);

  return (
    <StackScreenShell
      scrollEnabled={false}
      contentContainerStyle={styles.shellContent}
    >
      <View style={styles.screen}>
        <View style={styles.postcardRegion}>
          <AuthFeatureCarousel onActiveIndexChange={handleActiveIndexChange} />
        </View>

        <View style={styles.dotsRegion}>
          <AuthPostcardDots
            count={AUTH_FEATURE_SLIDES.length}
            activeIndex={activeSlideIndex}
          />
        </View>

        <View style={styles.ctaRegion}>
          {model.googleError ? (
            <Text style={styles.errorText}>{model.googleError}</Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            disabled={model.busy}
            onPress={model.submitGoogle}
            style={({ pressed }) => [
              styles.googleButton,
              pressed && !model.busy && styles.googleButtonPressed,
              model.busy && styles.googleButtonDisabled,
            ]}
          >
            {model.googleLoading ? (
              <ActivityIndicator size="small" color={colors.oauthGoogle} />
            ) : (
              <MaterialCommunityIcons
                name="google"
                size={22}
                color={colors.oauthGoogle}
              />
            )}
            <Text style={styles.googleLabel}>
              {model.googleLoading ? "Signing in…" : "Continue with Google"}
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
  },
  screen: {
    flex: 1,
  },
  postcardRegion: {
    flex: 1,
    minHeight: 0,
    justifyContent: "center",
    marginHorizontal: -spacing.lg,
  },
  dotsRegion: {
    marginTop: ONBOARDING_DOT_PAGER_GAP,
    paddingBottom: ONBOARDING_CTA_TOP_GAP,
  },
  ctaRegion: {
    backgroundColor: bento.twoToneBodySurface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.barBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  googleButtonPressed: {
    opacity: 0.88,
  },
  googleButtonDisabled: {
    opacity: 0.55,
  },
  googleLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  errorText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.error,
    textAlign: "center",
  },
});
