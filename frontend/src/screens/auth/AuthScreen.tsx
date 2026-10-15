import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthHeroLottie } from "@/components/auth/AuthHeroLottie";
import { StackScreenShell } from "@/components/layout/StackScreenShell";
import { Button } from "@/components/ui";
import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import { useAuthScreenModel } from "./useAuthScreenModel";
import { createThemedStyles, useTheme } from "@/theme";

const wordmark = require("../../../assets/images/splash-wordmark.png");

export default function AuthScreen() {
  const { colors, scheme } = useTheme();
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
            style={[
              styles.wordmark,
              scheme === "dark" ? { tintColor: colors.onAccent } : null,
            ]}
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
  errorText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.danger,
    textAlign: "center",
  },
}));
