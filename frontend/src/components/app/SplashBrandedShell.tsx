import { Image, View } from "react-native";

import {
  SPLASH_WORDMARK_ASPECT,
  SPLASH_WORDMARK_WIDTH_DP,
} from "@/constants/splash";
import { createThemedStyles, useTheme } from "@/theme";

const splashWordmark = require("../../../assets/images/splash-wordmark.png");

/**
 * Full-screen branded splash — matches native splash `imageWidth`. It follows the resolved theme
 * (soft-dark background, white wordmark in dark). The very first native frame stays light, see
 * `splashBackgroundColor` and the `dark` block of `expo-splash-screen` in app.json.
 */
export function SplashBrandedShell() {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const wordmarkWidth = SPLASH_WORDMARK_WIDTH_DP;
  const wordmarkHeight = wordmarkWidth / SPLASH_WORDMARK_ASPECT;

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Image
          source={splashWordmark}
          style={[
            { width: wordmarkWidth, height: wordmarkHeight },
            scheme === "dark" ? { tintColor: colors.onAccent } : null,
          ]}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessibilityLabel="Dime"
        />
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
}));
