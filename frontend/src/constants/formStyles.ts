import { Platform, StyleSheet } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, spacing } from "@/constants/theme";

export const formStyles = StyleSheet.create({
  fieldLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  /** Keep border width constant so focus/error states do not change layout height. */
  fieldShell: {
    minHeight: 48,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.barBackground,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
  },
  fieldShellFocused: {
    borderColor: colors.primary,
  },
  fieldShellError: {
    borderColor: "#BA1A1A",
  },
  /**
   * Android: default font padding + vertical padding makes placeholders sit high vs
   * typed text (especially MIUI). Zero vertical padding + no font padding; shell
   * minHeight + alignItems:center centers the line. iOS unchanged.
   */
  fieldInput: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
    ...Platform.select({
      android: {
        height: "100%",
        paddingVertical: 0,
        paddingTop: 0,
        paddingBottom: 0,
        textAlignVertical: "center",
        includeFontPadding: false,
      },
      default: {
        paddingVertical: spacing.sm,
      },
    }),
  },
  fieldError: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: "#BA1A1A",
    marginTop: spacing.xs,
  },
  iconButton: {
    padding: spacing.sm,
    marginLeft: spacing.xs,
  },
});
