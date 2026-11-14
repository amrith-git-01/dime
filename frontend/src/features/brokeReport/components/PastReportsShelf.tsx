import { Settings } from "lucide-react-native";
import { memo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { ReportToneId } from "@/constants/reportPalette";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";

import { useOpenReport } from "../hooks/useOpenReport";
import { useOpenReportSettings } from "../hooks/useOpenReportSettings";
import { useReportsList } from "../hooks/useReportsList";
import type { ReportListItem } from "../types";
import { monthName, monthShort } from "../utils/reportFormat";

/** How many months the shelf shows; the full list (and the report settings) live in Settings -> Broke Reports. */
export const SHELF_MONTHS = 6;

/** Month tiles cycle through the report tones so neighbours differ. */
const TILE_TONES: readonly ReportToneId[] = [
  "iris",
  "coral",
  "grape",
  "sky",
  "sun",
  "mint",
];

const TILE_SIZE = 112;
const DOT_SIZE = 10;

function MonthTile({
  item,
  toneId,
  onOpen,
}: {
  item: ReportListItem;
  toneId: ReportToneId;
  onOpen: (periodKey: string) => void;
}) {
  const styles = useStyles();
  const { colors, shadows } = useTheme();
  const tone = colors.report[toneId];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${monthName(item.month)} ${item.year} Broke Report${item.viewed ? "" : ", new"}`}
      onPress={() => {
        void triggerHaptic();
        onOpen(item.period_key);
      }}
      style={[styles.tile, shadows.card, { backgroundColor: tone.bg }]}
    >
      {item.viewed ? null : (
        <View style={[styles.dot, { backgroundColor: tone.highlight }]} />
      )}
      <Text style={[styles.month, { color: tone.text }]}>
        {monthShort(item.month)}
      </Text>
      <Text style={[styles.year, { color: tone.textSoft }]}>{item.year}</Text>
    </Pressable>
  );
}

/**
 * Insights: "Past reports", a horizontal shelf of the last months' Broke Reports with a dot on
 * the ones not opened yet, and a Report settings link. Renders nothing while there are none.
 */
export const PastReportsShelf = memo(function PastReportsShelf() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { data } = useReportsList();
  const openReport = useOpenReport();
  const openReportSettings = useOpenReportSettings();

  const items = (data ?? []).slice(0, SHELF_MONTHS);
  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.root}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>Past reports</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Report settings"
          hitSlop={8}
          onPress={() => {
            void triggerHaptic();
            openReportSettings();
          }}
          style={({ pressed }) => [styles.settingsLink, pressed && styles.pressed]}
        >
          <Settings size={14} color={colors.accentText} strokeWidth={2} />
          <Text style={styles.settingsLinkText}>Report settings</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {items.map((item, index) => (
          <MonthTile
            key={item.period_key}
            item={item}
            toneId={TILE_TONES[index % TILE_TONES.length]}
            onOpen={openReport}
          />
        ))}
      </ScrollView>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    gap: spacing.md,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  heading: {
    flexShrink: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.ink,
  },
  settingsLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 32,
  },
  settingsLinkText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.accentText,
  },
  pressed: {
    opacity: 0.7,
  },
  row: {
    gap: spacing.md,
    // Room for the card shadow above and below the tiles.
    paddingVertical: spacing.xs,
    paddingRight: spacing.lg,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: "flex-end",
  },
  dot: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: radius.full,
  },
  month: {
    fontFamily: fontFamilies.bold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.8,
  },
  year: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
  },
}));
