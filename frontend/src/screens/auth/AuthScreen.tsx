import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { Image, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StackScreenShell } from "@/components/layout/StackScreenShell";
import { Button } from "@/components/ui";
import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import {
  FeatureReel,
  WelcomeTrustLines,
} from "@/features/onboarding/components";

import { useAuthScreenModel } from "./useAuthScreenModel";
import { createThemedStyles, useTheme } from "@/theme";

const wordmark = require("../../../assets/images/splash-wordmark.png");

export default function AuthScreen() {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const model = useAuthScreenModel();
  const insets = useSafeAreaInsets();
  const [reelRegion, setReelRegion] = useState({ width: 0, height: 0 });

  const onReelLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setReelRegion({ width, height });
  };

  return (
    <StackScreenShell
      scrollEnabled={false}
      contentContainerStyle={styles.shellContent}
    >
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.brandHeader}>
          <Image
            source={wordmark}
            style={[
              styles.wordmark,
              scheme === "dark" ? { tintColor: colors.onAccent } : null,
            ]}
            accessibilityLabel="Dime"
            resizeMode="contain"
          />
        </View>

        <View style={styles.copy}>
          <Text
            accessibilityRole="header"
            textBreakStrategy="balanced"
            style={styles.headline}
          >
            Know where every rupee goes
          </Text>
          <Text style={styles.subhead}>
            Log what you spend in seconds and watch your month take shape.
          </Text>
        </View>

        <View style={styles.reelRegion} onLayout={onReelLayout}>
          <FeatureReel
            availableWidth={reelRegion.width}
            availableHeight={reelRegion.height - spacing.xl}
            paused={model.busy}
          />
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

          <Button
            title="Continue with Google"
            busyLabel="Signing in"
            accessibilityLabel="Continue with Google"
            loading={model.googleLoading}
            disabled={model.busy}
            leadingIcon={
              <MaterialCommunityIcons
                name="google"
                size={22}
                color={colors.onAccent}
              />
            }
            onPress={() => model.submitGoogle()}
          />

          <WelcomeTrustLines />
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
    paddingBottom: spacing.xl,
  },
  brandHeader: {
    alignItems: "flex-start",
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  wordmark: {
    width: 112,
    height: 37,
  },
  copy: {
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  headline: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.6,
    color: colors.ink,
  },
  subhead: {
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 23,
    color: colors.inkSoft,
  },
  reelRegion: {
    flex: 1,
    alignItems: "stretch",
    justifyContent: "flex-start",
    minHeight: 0,
    paddingTop: spacing.xl,
  },
  ctaRegion: {
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  errorText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.danger,
    textAlign: "center",
  },
}));
