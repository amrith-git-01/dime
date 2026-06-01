import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Spinner } from "@/components/ui";
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
      <View style={styles.loadingWrap}>
        <Spinner
          tone={variant === "onDark" ? "white" : "primary"}
          size="small"
        />
      </View>
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
  loadingWrap: {
    height: 28,
    justifyContent: "center",
    alignItems: "flex-start",
  },
});
