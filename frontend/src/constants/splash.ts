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
 * Longest the splash stays up (ms), counted from the same JS start as the minimum: a slow profile
 * check or a shell that never reports cannot hold it past this.
 */
export const SPLASH_SHELL_TIMEOUT_MS = 2000;

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
