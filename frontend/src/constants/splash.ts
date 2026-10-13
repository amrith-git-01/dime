import { Platform } from "react-native";

import { colors } from "./colors";

/** Must match `expo-splash-screen` backgroundColor in app.json. */
export const splashBackgroundColor = colors.pageBackground;

/** Minimum time the branded splash stays visible (ms). */
export const SPLASH_MIN_DISPLAY_MS = 1500;

/** Longest the splash waits for the first screen to lay out, so it can never stick. */
export const SPLASH_SHELL_TIMEOUT_MS = 4000;

/**
 * Native splash `imageWidth` — keep in sync with `expo-splash-screen` in app.json.
 * Android 12+ masks the icon to a ~192dp circle; wide wordmarks need a smaller width.
 */
export const SPLASH_WORDMARK_WIDTH_DP = Platform.select({
  android: 168,
  default: 300,
})!;

/** `splash-wordmark.png` pixel aspect (width / height). */
export const SPLASH_WORDMARK_ASPECT = 1413 / 587;
