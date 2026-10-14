import { Repeat } from "lucide-react-native";
import { memo } from "react";
import { Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { createThemedStyles, useTheme } from "@/theme";

/** Small "Recurring" pill for transactions posted by a recurring item or filed under a recurring category. */
export const RecurringBadge = memo(function RecurringBadge() {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.pill} accessibilityLabel="Recurring">
      <Repeat size={10} color={colors.inkSoft} strokeWidth={2} />
      <Text style={styles.text}>Recurring</Text>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    flexShrink: 0,
  },
  text: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    color: colors.inkSoft,
  },
}));
