import { Platform } from "react-native";

import { colors } from "./colors";

/**
 * Must match `expo-splash-screen` backgroundColor in app.json (the light one: the first native frame is always light,
 * the JS splash then follows the resolved theme).
 */
export const splashBackgroundColor = colors.pageBackground;

/** Minimum time the branded splash stays visible (ms), counted from JS start. */
export const SPLASH_MIN_DISPLAY_MS = 800;

/**
 * Safety cap (ms), counted from the same JS start as the minimum. The splash normally leaves only
 * when the first screen is ready; this is just so a broken start cannot hang on it forever. It is
 * deliberately long: releasing earlier shows the loader / half-built screen as a flash.
 */
export const SPLASH_SHELL_TIMEOUT_MS = 8000;

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
