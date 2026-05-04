import { Eye, EyeOff, X } from "lucide-react-native";
import { useState } from "react";
import {
  Platform,
  Pressable,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

import { formStyles } from "@/constants/formStyles";
import { colors } from "@/constants/theme";

export type TextFieldProps = Omit<TextInputProps, "style"> & {
  label: string;
  errorMessage?: string | null;
  showClear?: boolean;
  showPasswordToggle?: boolean;
};

export function TextField({
  label,
  errorMessage,
  showClear = true,
  showPasswordToggle = false,
  secureTextEntry,
  value,
  onChangeText,
  editable = true,
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
      <Text style={formStyles.fieldLabel}>{label}</Text>
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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
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
      {errorMessage ? (
        <Text style={formStyles.fieldError}>{errorMessage}</Text>
      ) : null}
    </View>
  );
}
