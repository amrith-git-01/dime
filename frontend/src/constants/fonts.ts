import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from "@expo-google-fonts/hanken-grotesk";

/** PostScript names used as React Native `fontFamily` values.
 * All UI text uses Hanken Grotesk — one geometric grotesk, everywhere.
 * Tabular figures are enabled via `fontVariant: ['tabular-nums']` where needed.
 */
export const fontFamilies = {
  regular: "HankenGrotesk_400Regular",
  medium: "HankenGrotesk_500Medium",
  semiBold: "HankenGrotesk_600SemiBold",
  bold: "HankenGrotesk_700Bold",
  /** @deprecated alias for semiBold — kept for migration */
  monoSemiBold: "HankenGrotesk_600SemiBold",
  /** @deprecated alias for regular — kept for migration */
  mono: "HankenGrotesk_400Regular",
} as const;

/** Pass to `useFonts` from `expo-font`. */
export const loadableAppFonts = {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
};
