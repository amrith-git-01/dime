import { ActivityIndicator, type ColorValue } from "react-native";

import { colors } from "@/constants/theme";

type SpinnerTone = "white" | "primary";

type SpinnerProps = {
  tone?: SpinnerTone;
  size?: "small" | "large";
};

const toneToColor: Record<SpinnerTone, ColorValue> = {
  white: colors.textOnPrimary,
  primary: colors.primary,
};

export function Spinner({ tone = "primary", size = "small" }: SpinnerProps) {
  return <ActivityIndicator color={toneToColor[tone]} size={size} />;
}
