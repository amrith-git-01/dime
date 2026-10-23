import { CloudOff } from "lucide-react-native";
import { memo } from "react";
import { Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { createThemedStyles, useTheme } from "@/theme";

/** Small pill on a transaction row that is saved on this device but not on the server yet. */
export const WaitingToSyncPill = memo(function WaitingToSyncPill() {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.pill} accessibilityLabel="Waiting to sync">
      <CloudOff size={10} color={colors.warning} strokeWidth={2} />
      <Text style={styles.text}>Waiting to sync</Text>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.warningTint,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    flexShrink: 0,
  },
  text: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    color: colors.warning,
  },
}));
