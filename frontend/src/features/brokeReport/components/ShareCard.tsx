import type { RefObject } from "react";
import { Text, View } from "react-native";

import type { ReportTone } from "@/constants/reportPalette";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { tabularNums } from "@/constants/typography";
import { createThemedStyles } from "@/theme";

import type { ResolvedCopy } from "../copy";
import type { ReportSnapshot } from "../types";
import { monthName } from "../utils/reportFormat";
import { buildReportStats } from "../utils/shareStats";

/** The card is drawn at 4:5 (1080x1350 at roughly 3x density) and captured as it is. */
export const SHARE_CARD_WIDTH = 360;
export const SHARE_CARD_HEIGHT = 450;

type ShareCardProps = {
  cardRef: RefObject<View | null>;
  snapshot: ReportSnapshot;
  copy: ResolvedCopy;
  tone: ReportTone;
  /** Rupee amounts on the card. Off by default: percentages and counts only. */
  showAmounts: boolean;
};

/**
 * The picture that gets shared: the title, three stats and the Dime name, in the closing tone (so
 * it follows the app's light or dark theme). It is mounted off screen next to the closing slide
 * and captured with Skia's `makeImageFromView`; `collapsable={false}` keeps the native view alive.
 */
export function ShareCard({
  cardRef,
  snapshot,
  copy,
  tone,
  showAmounts,
}: ShareCardProps) {
  const styles = useStyles();
  const stats = buildReportStats(snapshot, showAmounts);
  return (
    <View
      ref={cardRef}
      collapsable={false}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.card, { backgroundColor: tone.bg }]}
    >
      <View style={styles.header}>
        <Text style={[styles.brand, { color: tone.highlight }]}>Dime</Text>
        <Text style={[styles.headerLabel, { color: tone.textSoft }]}>
          Broke Report
        </Text>
      </View>

      <View style={styles.body}>
        <Text style={[styles.month, { color: tone.textSoft }]}>
          {`${monthName(snapshot.month)} ${snapshot.year}`}
        </Text>
        <Text
          numberOfLines={3}
          adjustsFontSizeToFit
          style={[styles.title, { color: tone.highlight }]}
        >
          {copy.title.name}
        </Text>
        <Text numberOfLines={3} style={[styles.tagline, { color: tone.text }]}>
          {showAmounts ? copy.title.tagline : copy.title.shareTagline}
        </Text>
      </View>

      <View style={styles.stats}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            style={[styles.stat, { backgroundColor: tone.panel }]}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.statValue, { color: tone.text }]}
            >
              {stat.value}
            </Text>
            <Text
              numberOfLines={2}
              style={[styles.statLabel, { color: tone.textSoft }]}
            >
              {stat.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(() => ({
  card: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    padding: spacing.xl,
    justifyContent: "space-between",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    fontFamily: fontFamilies.bold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  headerLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  body: {
    gap: spacing.sm,
  },
  month: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  title: {
    fontFamily: fontFamilies.bold,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -1.2,
  },
  tagline: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 22,
  },
  stats: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    minHeight: 84,
  },
  statValue: {
    fontFamily: fontFamilies.bold,
    fontSize: 22,
    lineHeight: 28,
    fontVariant: tabularNums,
  },
  statLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
  },
}));
