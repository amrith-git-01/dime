import * as Haptics from "expo-haptics";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, spacing } from "@/constants/theme";

type ButtonVariant = "primary" | "secondary";

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
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={(e) => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
      style={({ pressed }) => ({
        minHeight: 48,
        borderRadius: 12,
        paddingHorizontal: spacing.lg,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: isPrimary
          ? isDisabled
            ? `${colors.primary}99`
            : colors.primary
          : colors.barBackground,
        borderWidth: isPrimary ? 0 : StyleSheet.hairlineWidth,
        borderColor: colors.border,
        opacity: pressed && !isDisabled ? 0.92 : 1,
      })}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          color={isPrimary ? colors.barBackground : colors.primary}
        />
      ) : (
        <Text
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: 16,
            lineHeight: 22,
            color: isPrimary ? colors.barBackground : colors.primary,
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}
