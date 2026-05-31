import { colors, surfaces } from "@/constants/theme";

/** Tinted icon wells for settings hub rows. */
export const SETTINGS_ROW_ACCENTS = {
  capture: {
    backgroundColor: "rgba(56, 189, 248, 0.18)",
    iconColor: "#0284C7",
  },
  feedback: {
    backgroundColor: surfaces.primaryTint10,
    iconColor: colors.brandPrimary,
  },
} as const;

export const SETTINGS_HERO_AVATAR_SIZE = 68;

/** Account detail — larger preview, compact refresh control. */
export const SETTINGS_ACCOUNT_AVATAR_SIZE = 112;
export const SETTINGS_ACCOUNT_REFRESH_FAB_SIZE = 34;
export const SETTINGS_ACCOUNT_REFRESH_ICON_SIZE = 15;
