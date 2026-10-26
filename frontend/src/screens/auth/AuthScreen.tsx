import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { Image, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StackScreenShell } from "@/components/layout/StackScreenShell";
import { Button } from "@/components/ui";
import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { SPLASH_WORDMARK_ASPECT } from "@/constants/splash";
import { FeatureReel } from "@/features/onboarding/components";

import { useAuthScreenModel } from "./useAuthScreenModel";
import { createThemedStyles, useTheme } from "@/theme";

const wordmark = require("../../../assets/images/splash-wordmark.png");

/** Wordmark width; its height follows the PNG's aspect so the mark sits flush with the text edge. */
const WORDMARK_WIDTH = 84;
const PANEL_BOTTOM_PADDING = 20;
/** Space between the wordmark and the reel, inside the reel region (not available to the reel). */
const REEL_REGION_TOP_GAP = spacing.lg;
/** Extra room under the sign-in button; the panel above flexes, so this also shortens it. */
const BOTTOM_BREATHING_ROOM = 72;

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
      <View style={styles.screen}>
        <View
          style={[styles.panel, { paddingTop: insets.top + spacing.lg }]}
        >
          <Image
            source={wordmark}
            style={[
              styles.wordmark,
              scheme === "dark" ? { tintColor: colors.onAccent } : null,
            ]}
            accessibilityLabel="Dime"
            resizeMode="contain"
          />

          <View style={styles.reelRegion} onLayout={onReelLayout}>
            <FeatureReel
              frameless
              availableWidth={reelRegion.width}
              availableHeight={reelRegion.height - REEL_REGION_TOP_GAP}
              paused={model.busy}
            />
          </View>
        </View>

        <View
          style={[
            styles.bottom,
            {
              paddingBottom:
                Math.max(insets.bottom, spacing.lg) + BOTTOM_BREATHING_ROOM,
            },
          ]}
        >
          <View>
            <Text
              accessibilityRole="header"
              textBreakStrategy="balanced"
              maxFontSizeMultiplier={1.2}
              style={styles.headline}
            >
              Know where every rupee goes
            </Text>
            <Text maxFontSizeMultiplier={1.3} style={styles.subhead}>
              Log it in seconds. Watch your month take shape.
            </Text>
          </View>

          <View style={styles.actions}>
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
    backgroundColor: colors.paper,
  },
  // Soft accent-tinted panel that runs under the status bar; holds the wordmark and the reel.
  panel: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: spacing.xl,
    paddingBottom: PANEL_BOTTOM_PADDING,
    backgroundColor: colors.accentTint,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  wordmark: {
    width: WORDMARK_WIDTH,
    height: WORDMARK_WIDTH / SPLASH_WORDMARK_ASPECT,
  },
  reelRegion: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: REEL_REGION_TOP_GAP,
  },
  bottom: {
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  headline: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
    color: colors.ink,
  },
  subhead: {
    marginTop: 10,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
  },
  actions: {
    gap: spacing.lg,
  },
  errorText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.danger,
    textAlign: "center",
  },
}));
