import { Lock, ShieldCheck } from "lucide-react-native";
import { Text, View } from "react-native";

import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles, useTheme } from "@/theme";

const TRUST_LINES = [
  { label: "No bank login needed", Icon: ShieldCheck },
  { label: "Your data is never sold", Icon: Lock },
] as const;

/** The two promises on the welcome screen, each with its icon. */
export function WelcomeTrustLines() {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.list}>
      {TRUST_LINES.map(({ label, Icon }) => (
        <View key={label} style={styles.line}>
          <Icon size={18} color={colors.accentText} strokeWidth={2} />
          <Text style={styles.label}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  list: {
    gap: spacing.sm,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
}));
