import { Image, StyleSheet, useWindowDimensions, View } from "react-native";

import { splashBackgroundColor } from "@/constants/splash";

const splashImage = require("../../../assets/images/splash.png");

/** Full-screen branded splash — Dime wordmark only. */
const WORDMARK_WIDTH_RATIO = 0.94;
const WORDMARK_MAX_WIDTH = 640;
/** Taller box so `resizeMode="contain"` scales up the centered letters in the PNG. */
const WORDMARK_HEIGHT_RATIO = 0.32;

export function SplashBrandedShell() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const wordmarkWidth = Math.min(
    screenWidth * WORDMARK_WIDTH_RATIO,
    WORDMARK_MAX_WIDTH,
  );
  const wordmarkHeight = Math.max(
    screenHeight * WORDMARK_HEIGHT_RATIO,
    wordmarkWidth * 0.55,
  );

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Image
          source={splashImage}
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
