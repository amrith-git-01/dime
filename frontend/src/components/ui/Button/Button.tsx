import { Pressable, StyleSheet, Text, type PressableProps } from "react-native";

import {
  BUTTON_LOADER_SIZE,
  InfinityButtonLoader,
} from "@/components/ui/InfinityButtonLoader";
import { colors, spacing, surfaces } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "ghostDanger";

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
  const isGhost = variant === "ghost";
  const isGhostDanger = variant === "ghostDanger";
  const isDisabled = disabled || loading;

  const backgroundColor = isPrimary
    ? isDisabled
      ? `${colors.primary}99`
      : colors.primary
    : isDanger
      ? isDisabled
        ? surfaces.dangerTint06
        : surfaces.dangerTint08
      : "transparent";

  const borderWidth = isPrimary ? 0 : StyleSheet.hairlineWidth;
  const borderColor = isDanger || isGhostDanger ? colors.danger : colors.border;

  const labelColor = isPrimary
    ? colors.barBackground
    : isDanger || isGhostDanger
      ? colors.danger
      : isGhost
        ? colors.textPrimary
        : colors.primary;

  const loaderColor = labelColor;

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
        <InfinityButtonLoader color={loaderColor} size={BUTTON_LOADER_SIZE} />
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
