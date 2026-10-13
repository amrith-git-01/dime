import { Platform } from "react-native";

import { createThemedStyles } from "@/theme/useThemedStyles";

import { fontFamilies } from "./fonts";
import { spacing } from "./spacing";

export const useFormStyles = createThemedStyles(({ colors }) => ({
  fieldLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.accentText,
    marginBottom: spacing.sm,
  },
  /** Keep border width constant so focus/error states do not change layout height. */
  fieldShell: {
    minHeight: 48,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
  },
  fieldShellFocused: {
    borderColor: colors.accentText,
  },
  fieldShellError: {
    borderColor: colors.danger,
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
    color: colors.ink,
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
    color: colors.danger,
    marginTop: spacing.xs,
  },
  iconButton: {
    padding: spacing.sm,
    marginLeft: spacing.xs,
  },
}));
