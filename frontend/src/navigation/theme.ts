import { DefaultTheme, type Theme } from "@react-navigation/native";

import { fontFamilies } from "@/constants/fonts";

/** React Navigation headers, labels, and other themed text use these faces. */
export const appNavigationTheme: Theme = {
  ...DefaultTheme,
  fonts: {
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
  },
};
