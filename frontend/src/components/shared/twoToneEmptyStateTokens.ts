import { colors, surfaces } from "@/constants";

/** Default icon well for {@link TwoToneEmptyState} when accent is omitted. */
export const TWO_TONE_EMPTY_DEFAULT_ACCENT = {
  backgroundColor: surfaces.primaryTint10,
  iconColor: colors.brandPrimary,
} as const;

/** Centered card width on full-screen empty states (notifications inbox, etc.). */
export const TWO_TONE_EMPTY_CENTERED_MAX_WIDTH = 300;
