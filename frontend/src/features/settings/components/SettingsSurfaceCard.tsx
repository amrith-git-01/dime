import { memo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { radius, shadows, surface } from "@/constants";

import { SETTINGS_CARD_PADDING } from "../constants/settingsTokens";

type SettingsSurfaceCardProps = {
  children: ReactNode;
  /** Use cardElevated for the account hero. */
  elevated?: boolean;
  /** Default true — set false when children manage their own padding. */
  padded?: boolean;
};

export const SettingsSurfaceCard = memo(function SettingsSurfaceCard({
  children,
  elevated = false,
  padded = true,
}: SettingsSurfaceCardProps) {
  return (
    <View
      style={[
        styles.card,
        elevated ? shadows.cardElevated : shadows.card,
        padded && styles.padded,
      ]}
    >
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: surface,
    borderRadius: radius.lg,
    overflow: "visible",
  },
  padded: {
    padding: SETTINGS_CARD_PADDING,
  },
});
