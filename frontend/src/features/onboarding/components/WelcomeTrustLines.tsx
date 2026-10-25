import { ShieldCheck } from "lucide-react-native";
import { Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles, useTheme } from "@/theme";

const TRUST_TEXT = "No bank login · Your data is never sold";
const TRUST_ACCESSIBILITY_LABEL = "No bank login. Your data is never sold.";

/** The welcome screen's two promises as one left-aligned line (shield icon, then the text) under the CTA. */
export function WelcomeTrustLines() {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={TRUST_ACCESSIBILITY_LABEL}
      style={styles.row}
    >
      <View style={styles.icon}>
        <ShieldCheck size={16} color={colors.accentText} strokeWidth={2} />
      </View>
      <Text maxFontSizeMultiplier={1.3} style={styles.label}>{TRUST_TEXT}</Text>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  // Centres the 16 dp icon on the first 18 dp text line when the text wraps.
  icon: {
    paddingTop: 1,
  },
  label: {
    flex: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    textAlign: "left",
  },
}));
