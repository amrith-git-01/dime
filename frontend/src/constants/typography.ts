import { bento } from "./bento";
import { colors } from "./colors";
import { fontFamilies } from "./fonts";

export const typography = {
  tabLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
  },
  screenTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.01 * 24,
  },
  screenSubtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  sectionTitle: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  linkSmall: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.primary,
  },
  cardTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  cardBody: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  emptyHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inactive,
  },
  emptyBody: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  headerDisplayName: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.01 * 20,
    color: colors.textPrimary,
  },
  headerGreetingOnPrimary: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textOnPrimaryMuted,
  },
  headerDisplayNameOnPrimary: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.01 * 20,
    color: colors.textOnPrimary,
  },
  headerGreetingLine: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.headerGreetingForeground,
  },
  headerUsernameLine: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textOnPrimary,
  },
  mono: {
    fontFamily: fontFamilies.mono,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  monoEmphasis: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  bentoAmountHero: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 28,
    lineHeight: 34,
    color: bento.onSurface.primary,
  },
  bentoAmount: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 22,
    lineHeight: 28,
    color: bento.onSurface.primary,
  },
  bentoAmountCompact: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 18,
    lineHeight: 24,
    color: bento.onSurface.primary,
  },
  bentoLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: bento.onSurface.secondary,
  },
  bentoSubtext: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    color: bento.onSurface.muted,
  },
  transactionList: {
    merchant: {
      fontFamily: fontFamilies.semiBold,
      fontSize: 16,
      lineHeight: 20,
      color: colors.textListPrimary,
    },
    time: {
      fontFamily: fontFamilies.regular,
      fontSize: 12,
      lineHeight: 16,
      color: colors.textListSecondary,
    },
    via: {
      fontFamily: fontFamilies.regular,
      fontSize: 11,
      lineHeight: 14,
      color: colors.textListSecondary,
    },
    categoryTag: {
      fontFamily: fontFamilies.medium,
      fontSize: 10,
      lineHeight: 13,
      color: colors.textListPrimary,
    },
    tagSeparator: {
      fontFamily: fontFamilies.regular,
      fontSize: 11,
      lineHeight: 14,
      color: colors.textListSecondary,
    },
    amount: {
      fontFamily: fontFamilies.monoSemiBold,
      fontSize: 16,
      lineHeight: 20,
      color: colors.textListPrimary,
    },
  },
};
