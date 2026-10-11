import { Eye, EyeOff, X } from "lucide-react-native";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

import { colors, spacing } from "@/constants";
import { formStyles } from "@/constants/formStyles";

export type TextFieldProps = Omit<TextInputProps, "style"> & {
  label: string;
  /** When false, only the input shell is rendered (section title lives outside). */
  hideLabel?: boolean;
  /** Shown on the same row as the label, right-aligned (e.g. character count). */
  labelRight?: ReactNode;
  errorMessage?: string | null;
  showClear?: boolean;
  showPasswordToggle?: boolean;
  /** Multiline shell min height (textarea). Defaults to 132 when multiline. */
  minInputHeight?: number;
};

export function TextField({
  label,
  hideLabel = false,
  labelRight,
  errorMessage,
  showClear = true,
  showPasswordToggle = false,
  secureTextEntry,
  value,
  onChangeText,
  editable = true,
  onFocus,
  onBlur,
  multiline,
  minInputHeight,
  ...rest
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const isPassword = Boolean(showPasswordToggle);
  const effectiveSecure = isPassword ? hidden : secureTextEntry;
  const hasValue = Boolean(value && String(value).length > 0);
  const showClearButton = showClear && hasValue && editable !== false;
  const isMultiline = Boolean(multiline);
  const textareaMinHeight = minInputHeight ?? (isMultiline ? 132 : undefined);
  return (
    <View>
      {!hideLabel ? (
        labelRight ? (
          <View style={styles.labelRow}>
            <Text style={[formStyles.fieldLabel, styles.labelInRow]}>
              {label}
            </Text>
            {labelRight}
          </View>
        ) : (
          <Text style={formStyles.fieldLabel}>{label}</Text>
        )
      ) : null}
      <View
        style={[
          formStyles.fieldShell,
          isMultiline && styles.textareaShell,
          textareaMinHeight != null && { minHeight: textareaMinHeight },
          focused && formStyles.fieldShellFocused,
          Boolean(errorMessage) && formStyles.fieldShellError,
        ]}
      >
        <TextInput
          style={[
            formStyles.fieldInput,
            isMultiline && styles.textareaInput,
            textareaMinHeight != null && {
              minHeight: textareaMinHeight - spacing.md,
            },
          ]}
          placeholderTextColor={colors.inactive}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          secureTextEntry={effectiveSecure}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          underlineColorAndroid="transparent"
          textAlignVertical={
            isMultiline
              ? "top"
              : Platform.OS === "android"
                ? "center"
                : undefined
          }
          {...rest}
        />
        {isPassword ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
            hitSlop={12}
            style={formStyles.iconButton}
            onPress={() => setHidden((h) => !h)}
          >
            {hidden ? (
              <Eye size={20} color={colors.inactive} />
            ) : (
              <EyeOff size={20} color={colors.inactive} />
            )}
          </Pressable>
        ) : null}
        {showClearButton ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear text"
            hitSlop={12}
            style={[formStyles.iconButton, isMultiline && styles.textareaClear]}
            onPress={() => onChangeText?.("")}
          >
            <X size={18} color={colors.inactive} />
          </Pressable>
        ) : null}
      </View>
      {typeof errorMessage === "string" && errorMessage.length > 0 ? (
        <Text style={formStyles.fieldError}>{errorMessage}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  labelInRow: {
    flex: 1,
    marginBottom: 0,
  },
  textareaShell: {
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
  },
  textareaInput: {
    height: undefined,
    paddingTop: Platform.OS === "android" ? spacing.xs : undefined,
    textAlignVertical: "top",
  },
  textareaClear: {
    marginTop: spacing.xs,
  },
});
