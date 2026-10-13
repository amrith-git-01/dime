import {
  DarkTheme,
  DefaultTheme,
  type Theme as NavigationTheme,
} from "@react-navigation/native";

import { fontFamilies } from "@/constants/fonts";
import { darkColors, lightColors, type ColorScheme, type ThemeColors } from "@/theme";

/** React Navigation headers, labels, and other themed text use these faces. */
const fonts = {
  regular: {
    fontFamily: fontFamilies.regular,
    fontWeight: "400",
  },
  medium: {
    fontFamily: fontFamilies.medium,
    fontWeight: "500",
  },
  bold: {
    fontFamily: fontFamilies.semiBold,
    fontWeight: "600",
  },
  heavy: {
    fontFamily: fontFamilies.semiBold,
    fontWeight: "700",
  },
} as const;

function createNavigationTheme(
  base: NavigationTheme,
  colors: ThemeColors,
): NavigationTheme {
  return Object.freeze({
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accentText,
      background: colors.paper,
      card: colors.paper,
      text: colors.ink,
      border: colors.line,
      notification: colors.danger,
    },
    fonts,
  });
}

/** One frozen navigation theme per scheme, built once at module load. */
const navigationThemes: Record<ColorScheme, NavigationTheme> = {
  light: createNavigationTheme(DefaultTheme, lightColors),
  dark: createNavigationTheme(DarkTheme, darkColors),
};

export function getNavigationTheme(scheme: ColorScheme): NavigationTheme {
  return navigationThemes[scheme];
}
