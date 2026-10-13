import { memo, type ReactNode } from "react";
import { View } from "react-native";

import { radius } from "@/constants";

import { SETTINGS_CARD_PADDING } from "../constants/settingsTokens";
import { createThemedStyles, useTheme } from "@/theme";

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
  const { shadows } = useTheme();
  const styles = useStyles();
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

const useStyles = createThemedStyles(({ colors }) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "visible",
  },
  padded: {
    padding: SETTINGS_CARD_PADDING,
  },
}));
