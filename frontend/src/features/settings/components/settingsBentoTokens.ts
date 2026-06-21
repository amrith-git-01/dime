import { inkSoft } from "@/constants";

const NEUTRAL_ICON_WELL = {
  // eslint-disable-next-line no-restricted-syntax
  backgroundColor: "#F2F2F3", // near-white neutral — no design token exists at this exact value
  iconColor: inkSoft,
} as const;

/** Uniform neutral icon wells for all settings hub rows. */
export const SETTINGS_ROW_ACCENTS = {
  capture: NEUTRAL_ICON_WELL,
  feedback: NEUTRAL_ICON_WELL,
} as const;

export const SETTINGS_HERO_AVATAR_SIZE = 68;

/** Account detail — larger preview, compact refresh control. */
export const SETTINGS_ACCOUNT_AVATAR_SIZE = 112;
export const SETTINGS_ACCOUNT_REFRESH_FAB_SIZE = 34;
export const SETTINGS_ACCOUNT_REFRESH_ICON_SIZE = 15;
