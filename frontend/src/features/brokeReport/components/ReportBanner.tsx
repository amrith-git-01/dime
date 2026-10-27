import { Sparkles, X } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";

import { useOpenReport } from "../hooks/useOpenReport";
import { useReportBanner } from "../hooks/useReportBanner";

const DISMISS_HIT = 44;

/**
 * Home: "Your {Month} Broke Report is ready". Sits above the arrangeable cards (it is not one of
 * them), only in the first week of the month after the report and only while it is unviewed.
 * Renders nothing otherwise.
 */
export const ReportBanner = memo(function ReportBanner() {
  const styles = useStyles();
  const { colors, shadows } = useTheme();
  const tone = colors.report.iris;
  const { periodKey, monthLabel, dismiss } = useReportBanner();
  const openReport = useOpenReport();

  if (!periodKey || !monthLabel) {
    return null;
  }

  return (
    <View style={[styles.card, shadows.card, { backgroundColor: tone.bg }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Your ${monthLabel} Broke Report is ready. See how your wallet did.`}
        onPress={() => {
          void triggerHaptic();
          openReport(periodKey);
        }}
        style={styles.body}
      >
        <View style={[styles.icon, { backgroundColor: tone.highlight }]}>
          <Sparkles size={20} color={tone.onHighlight} strokeWidth={2.25} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.title, { color: tone.text }]} numberOfLines={2}>
            {`Your ${monthLabel} Broke Report is ready`}
          </Text>
          <Text style={[styles.subtitle, { color: tone.textSoft }]}>
            See how your wallet did
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Dismiss the ${monthLabel} Broke Report banner`}
        hitSlop={4}
        onPress={() => {
          void triggerHaptic();
          dismiss();
        }}
        style={styles.dismiss}
      >
        <X size={18} color={tone.textSoft} strokeWidth={2.25} />
      </Pressable>
    </View>
  );
});

const useStyles = createThemedStyles(() => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
  },
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingLeft: spacing.lg,
    minWidth: 0,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  dismiss: {
    width: DISMISS_HIT,
    height: DISMISS_HIT,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.xs,
  },
}));
