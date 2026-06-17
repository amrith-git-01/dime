import { Platform, type ViewStyle } from "react-native";

import { colors } from "./colors";

/** White card shadow — design system §1.4 */
const cardIos: ViewStyle = {
  shadowColor: colors.brandPrimary,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
};

const cardAndroid: ViewStyle = {
  elevation: 3,
};

/** Two-tone / month bento card (slightly stronger). */
const cardElevatedIos: ViewStyle = {
  shadowColor: colors.brandPrimary,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.12,
  shadowRadius: 12,
};

/** Stitch auth postcard — soft violet ambient lift. */
const postcardIos: ViewStyle = {
  shadowColor: colors.brandPrimary,
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.08,
  shadowRadius: 24,
};

export const shadows = {
  card: Platform.select({
    android: cardAndroid,
    default: cardIos,
  }) as ViewStyle,
  cardElevated: Platform.select({
    android: { elevation: 4 },
    default: cardElevatedIos,
  }) as ViewStyle,
  postcard: Platform.select({
    android: { elevation: 6 },
    default: postcardIos,
  }) as ViewStyle,
  hero: Platform.select({
    android: { elevation: 8 },
    default: {
      shadowColor: colors.brandPrimary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
    },
  }) as ViewStyle,
  toast: Platform.select({
    android: { elevation: 6 },
    default: {
      shadowColor: colors.toastShadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
    },
  }) as ViewStyle,
} as const;
