import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthHeroLottie } from "@/components/auth/AuthHeroLottie";
import { StackScreenShell } from "@/components/layout/StackScreenShell";
import { ButtonBusyContent } from "@/components/ui";
import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

import { useAuthScreenModel } from "./useAuthScreenModel";
import { createThemedStyles, useTheme } from "@/theme";

const wordmark = require("../../../assets/images/splash-wordmark.png");

export default function AuthScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const model = useAuthScreenModel();
  const insets = useSafeAreaInsets();

  return (
    <StackScreenShell
      scrollEnabled={false}
      contentContainerStyle={styles.shellContent}
    >
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.brandHeader}>
          <Image
            source={wordmark}
            style={styles.wordmark}
            accessibilityLabel="Dime"
            resizeMode="contain"
          />
        </View>

        <View style={styles.heroRegion}>
          <AuthHeroLottie />
        </View>

        <View
          style={[
            styles.ctaRegion,
            { paddingBottom: Math.max(insets.bottom, spacing.md) },
          ]}
        >
          {model.googleError ? (
            <Text style={styles.errorText}>{model.googleError}</Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            disabled={model.busy}
            onPress={() => {
              void triggerHaptic();
              model.submitGoogle();
            }}
            style={({ pressed }) => [
              styles.googleButton,
              pressed && !model.busy && styles.googleButtonPressed,
              model.busy && styles.googleButtonDisabled,
            ]}
          >
            {model.googleLoading ? null : (
              <MaterialCommunityIcons name="google" size={22} color={colors.onAccent} />
            )}
            <ButtonBusyContent
              loading={model.googleLoading}
              label="Continue with Google"
              busyLabel="Signing in"
              color={colors.onAccent}
              textStyle={styles.googleLabel}
            />
          </Pressable>
        </View>
      </View>
    </StackScreenShell>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  shellContent: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  screen: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  brandHeader: {
    alignItems: "flex-start",
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  wordmark: {
    width: 132,
    height: 44,
  },
  heroRegion: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 0,
    paddingBottom: spacing.sm,
  },
  ctaRegion: {
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 54,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.accent,
    ...shadows.cardElevated,
  },
  googleButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  googleButtonDisabled: {
    opacity: 0.55,
  },
  googleLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  errorText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.danger,
    textAlign: "center",
  },
}));
