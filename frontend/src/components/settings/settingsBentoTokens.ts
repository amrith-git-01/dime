import { colors, surfaces } from "@/constants";

/** Tinted icon wells for settings hub rows. */
export const SETTINGS_ROW_ACCENTS = {
  capture: {
    backgroundColor: surfaces.iconWellSky,
    iconColor: colors.iconAccentSky,
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
