import { Pressable, StyleSheet, type PressableProps } from "react-native";

import { ButtonBusyContent } from "./ButtonBusyContent";
import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";

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
  const styles = useStyles();
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const containerStyle =
    variant === "primary" && isDisabled
      ? styles.primaryDisabled
      : variant === "danger" && isDisabled
        ? styles.dangerDisabled
        : styles[variant];

  const labelColor =
    variant === "primary"
      ? colors.onAccent
      : variant === "danger"
        ? colors.onDanger
        : variant === "ghostDanger"
          ? colors.danger
          : variant === "ghost"
            ? colors.ink
            : colors.accentText;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={(e) => {
        void triggerHaptic();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.base,
        containerStyle,
        pressed && !isDisabled && styles.pressed,
      ]}
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

const useStyles = createThemedStyles(({ colors }) => ({
  base: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: colors.accent,
  },
  primaryDisabled: {
    backgroundColor: colors.accentDisabled,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  dangerDisabled: {
    backgroundColor: colors.dangerDisabled,
  },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  ghostDanger: {
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger,
  },
  pressed: {
    opacity: 0.92,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 22,
  },
}));
