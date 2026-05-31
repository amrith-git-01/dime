import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, spacing } from "@/constants/theme";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";

type ButtonVariant = "primary" | "secondary" | "danger";

export type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
};

export function Button({
  title,
  variant = "primary",
  loading = false,
  disabled,
  onPress,
  ...rest
}: ButtonProps) {
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const isDisabled = disabled || loading;

  const backgroundColor = isPrimary
    ? isDisabled
      ? `${colors.primary}99`
      : colors.primary
    : isDanger
      ? isDisabled
        ? "rgba(220, 38, 38, 0.06)"
        : "rgba(220, 38, 38, 0.08)"
      : colors.barBackground;

  const borderWidth = isPrimary ? 0 : StyleSheet.hairlineWidth;
  const borderColor = isDanger ? colors.danger : colors.border;

  const labelColor = isPrimary
    ? colors.barBackground
    : isDanger
      ? colors.danger
      : colors.primary;

  const spinnerColor = isPrimary
    ? colors.barBackground
    : isDanger
      ? colors.danger
      : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={(e) => {
        void triggerLightHaptic();
        onPress?.(e);
      }}
      style={({ pressed }) => ({
        minHeight: 48,
        borderRadius: 12,
        paddingHorizontal: spacing.lg,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor,
        borderWidth,
        borderColor,
        opacity: pressed && !isDisabled ? 0.92 : 1,
      })}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <Text
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: 16,
            lineHeight: 22,
            color: labelColor,
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}
