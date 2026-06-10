import { memo } from "react";
import { StyleSheet, Text } from "react-native";

import { SkeletonStrip } from "@/components/ui";
import { bento } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

type BentoAmountRowProps = {
  amount: string;
  isLoading?: boolean;
  variant: "onDark" | "onPastel";
};

/** Single currency figure for spend bento tiles — no caption labels. */
export const BentoAmountRow = memo(function BentoAmountRow({
  amount,
  isLoading = false,
  variant,
}: BentoAmountRowProps) {
  const amountColor =
    variant === "onDark" ? bento.onSurface.primary : bento.onPastel.accent;

  if (isLoading) {
    return (
      <SkeletonStrip
        variant="amountHero"
        tone={variant === "onDark" ? "onPrimary" : "surface"}
      />
    );
  }

  return (
    <Text
      style={[styles.amount, { color: amountColor }]}
      numberOfLines={1}
      adjustsFontSizeToFit
    >
      {amount}
    </Text>
  );
});

const styles = StyleSheet.create({
  amount: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 22,
    lineHeight: 28,
  },
});
