import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_600SemiBold,
} from "@expo-google-fonts/jetbrains-mono";

/** PostScript names used as React Native `fontFamily` values (must match loaded faces). */
export const fontFamilies = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semiBold: "Inter_600SemiBold",
  mono: "JetBrainsMono_400Regular",
  monoSemiBold: "JetBrainsMono_600SemiBold",
} as const;

/** Pass to `useFonts` from `expo-font`. */
export const loadableAppFonts = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  JetBrainsMono_400Regular,
  JetBrainsMono_600SemiBold,
};
