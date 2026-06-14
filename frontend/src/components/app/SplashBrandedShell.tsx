import { Image, StyleSheet, View } from "react-native";

import {
  SPLASH_WORDMARK_ASPECT,
  SPLASH_WORDMARK_WIDTH_DP,
  splashBackgroundColor,
} from "@/constants/splash";

const splashWordmark = require("../../../assets/images/splash-wordmark.png");

/** Full-screen branded splash — matches native splash `imageWidth`. */
export function SplashBrandedShell() {
  const wordmarkWidth = SPLASH_WORDMARK_WIDTH_DP;
  const wordmarkHeight = wordmarkWidth / SPLASH_WORDMARK_ASPECT;

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Image
          source={splashWordmark}
          style={{ width: wordmarkWidth, height: wordmarkHeight }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessibilityLabel="Dime"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: splashBackgroundColor,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
});
