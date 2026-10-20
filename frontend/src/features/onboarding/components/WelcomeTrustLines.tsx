import { Lock, ShieldCheck } from "lucide-react-native";
import { Text, View } from "react-native";

import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles, useTheme } from "@/theme";

const TRUST_LINES = [
  { label: "No bank login needed", Icon: ShieldCheck },
  { label: "Your data is never sold", Icon: Lock },
] as const;

/** The two promises on the welcome screen, each with its icon, as one compact row under the CTA. */
export function WelcomeTrustLines() {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.list}>
      {TRUST_LINES.map(({ label, Icon }) => (
        <View key={label} style={styles.line}>
          <Icon size={16} color={colors.accentText} strokeWidth={2} />
          <Text style={styles.label}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  list: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: spacing.md,
    rowGap: spacing.xs,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
}));
