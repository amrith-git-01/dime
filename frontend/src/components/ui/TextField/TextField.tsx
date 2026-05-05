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

import { formStyles } from "@/constants/formStyles";
import { colors, spacing } from "@/constants/theme";

export type TextFieldProps = Omit<TextInputProps, "style"> & {
  label: string;
  /** Shown on the same row as the label, right-aligned (e.g. character count). */
  labelRight?: ReactNode;
  errorMessage?: string | null;
  showClear?: boolean;
  showPasswordToggle?: boolean;
};

export function TextField({
  label,
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
  ...rest
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const isPassword = Boolean(showPasswordToggle);
  const effectiveSecure = isPassword ? hidden : secureTextEntry;
  const hasValue = Boolean(value && String(value).length > 0);
  const showClearButton = showClear && hasValue && editable !== false;
  return (
    <View>
      {labelRight ? (
        <View style={styles.labelRow}>
          <Text style={[formStyles.fieldLabel, styles.labelInRow]}>
            {label}
          </Text>
          {labelRight}
        </View>
      ) : (
        <Text style={formStyles.fieldLabel}>{label}</Text>
      )}
      <View
        style={[
          formStyles.fieldShell,
          focused && formStyles.fieldShellFocused,
          Boolean(errorMessage) && formStyles.fieldShellError,
        ]}
      >
        <TextInput
          style={formStyles.fieldInput}
          placeholderTextColor={colors.inactive}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          secureTextEntry={effectiveSecure}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          textAlignVertical={Platform.OS === "android" ? "center" : undefined}
          {...rest}
        />
        {isPassword ? (
          <Pressable
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
            accessibilityLabel="Clear text"
            hitSlop={12}
            style={formStyles.iconButton}
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
});
