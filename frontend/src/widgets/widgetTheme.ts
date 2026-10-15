import type { JSX } from "react";
import type { ColorProp, WidgetRepresentation } from "react-native-android-widget";

import { darkColors, lightColors, type ThemeColors } from "@/theme/palettes";
import { getThemePreference } from "@/theme/themePreference";

/** The widget runtime only takes literal colour strings; the palette types them as plain `string`. */
export const hex = (value: string) => value as ColorProp;

/**
 * Draws a widget in the app's chosen theme. A forced light/dark choice renders that one variant;
 * "system" hands the launcher both so it switches with the OS. Headless-safe: reads MMKV only.
 */
export function renderThemed(
  build: (colors: ThemeColors) => JSX.Element,
): WidgetRepresentation {
  const preference = getThemePreference();
  if (preference === "light") {
    return build(lightColors);
  }
  if (preference === "dark") {
    return build(darkColors);
  }
  return { light: build(lightColors), dark: build(darkColors) };
}
