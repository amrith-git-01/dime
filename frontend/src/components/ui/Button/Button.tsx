import { Pressable, StyleSheet, type PressableProps } from "react-native";

import { ButtonBusyContent } from "./ButtonBusyContent";
import { colors, danger, spacing, surface } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "ghostDanger";

export type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  title: string;
  variant?: ButtonVariant;
  /** Busy state: disables the button and shows a spinner left of `busyLabel`. */
  loading?: boolean;
  /** Continuous-tense label while busy ("Saving"). Derived from `title` when omitted. */
  busyLabel?: string;
};

export function Button({
  title,
  variant = "primary",
  loading = false,
  busyLabel,
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
        ? `${danger}99`
        : danger
      : "transparent";

  const borderWidth = isPrimary || isDanger ? 0 : StyleSheet.hairlineWidth;
  const borderColor = isGhostDanger ? colors.danger : colors.border;

  const labelColor =
    isPrimary || isDanger
      ? surface
      : isGhostDanger
        ? colors.danger
        : isGhost
          ? colors.textPrimary
          : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={(e) => {
        void triggerHaptic();
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
      <ButtonBusyContent
        loading={loading}
        label={title}
        busyLabel={busyLabel}
        color={labelColor}
        textStyle={styles.label}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 22,
  },
});
