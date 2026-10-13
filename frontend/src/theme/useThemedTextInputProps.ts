import type { TextInputProps } from "react-native";

import { darkTheme, lightTheme, type ColorScheme, type Theme } from "./palettes";
import { useTheme } from "./ThemeProvider";

export type ThemedTextInputProps = Pick<
  TextInputProps,
  "placeholderTextColor" | "selectionColor" | "cursorColor" | "keyboardAppearance"
>;

function build({ scheme, colors }: Theme): ThemedTextInputProps {
  return Object.freeze({
    placeholderTextColor: colors.inkFaint,
    selectionColor: colors.accentText,
    cursorColor: colors.accentText,
    keyboardAppearance: scheme,
  });
}

/** Built once per scheme, so spreading it onto an input never allocates. */
const propsByScheme: Record<ColorScheme, ThemedTextInputProps> = {
  light: build(lightTheme),
  dark: build(darkTheme),
};

/**
 * Placeholder, caret, selection and keyboard appearance for a text input. `AppTextInput` and
 * `TextField` apply it already; spread it onto any raw `TextInput`.
 */
export function useThemedTextInputProps(): ThemedTextInputProps {
  return propsByScheme[useTheme().scheme];
}
