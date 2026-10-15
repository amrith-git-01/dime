import type { ReactNode } from "react";
import { Pressable, View, type PressableProps } from "react-native";

import { ButtonBusyContent } from "./ButtonBusyContent";
import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  title: string;
  variant?: ButtonVariant;
  /** `compact` is for inline CTAs (empty states, retry rows); `default` is the full-height pill. */
  size?: "default" | "compact";
  /** Icon rendered left of the label (hidden while busy; the spinner takes its place). */
  leadingIcon?: ReactNode;
  /** Busy state: disables the button and shows a spinner left of `busyLabel`. */
  loading?: boolean;
  /** Continuous-tense label while busy ("Saving"). Derived from `title` when omitted. */
  busyLabel?: string;
};

/**
 * The one button of the app: a full pill (the Add transaction footer look).
 * `primary` = accent fill, `danger` = danger fill, `secondary`/`ghost` = outlined.
 */
export function Button({
  title,
  variant = "primary",
  size = "default",
  leadingIcon,
  loading = false,
  busyLabel,
  disabled,
  onPress,
  ...rest
}: ButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  const isFilled = variant === "primary" || variant === "danger";

  const labelColor =
    variant === "primary"
      ? colors.onAccent
      : variant === "danger"
        ? colors.onDanger
        : colors.ink;

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
        size === "compact" && styles.baseCompact,
        styles[variant],
        isDisabled && (isFilled ? styles.disabledFilled : styles.disabledOutlined),
        pressed && !isDisabled && styles.pressed,
      ]}
      {...rest}
    >
      <View style={styles.row}>
        {leadingIcon && !loading ? leadingIcon : null}
        <ButtonBusyContent
          loading={loading}
          label={title}
          busyLabel={busyLabel}
          color={labelColor}
          textStyle={[
            isFilled ? styles.labelFilled : styles.labelOutlined,
            size === "compact" && styles.labelCompact,
          ]}
        />
      </View>
    </Pressable>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  base: {
    minHeight: 50,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  baseCompact: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  primary: {
    backgroundColor: colors.accent,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.line,
  },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.line,
  },
  disabledFilled: {
    opacity: 0.45,
  },
  disabledOutlined: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  labelFilled: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  labelOutlined: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
  },
  labelCompact: {
    fontSize: 14,
  },
}));
