import { StyleSheet } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, spacing } from "@/constants/theme";

export const formStyles = StyleSheet.create({
  fieldLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
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
  fieldInput: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
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
