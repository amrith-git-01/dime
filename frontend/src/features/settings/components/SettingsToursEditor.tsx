import { Check, Play } from "lucide-react-native";
import { memo } from "react";
import { Text, View } from "react-native";

import { ProgressBar } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants";
import type { TourIconSpec } from "@/features/appTour";
import { resolveTourIcon, TourMasterBadge } from "@/features/appTour/components";
import { createThemedStyles, useTheme } from "@/theme";

import { SETTINGS_SECTION_GAP } from "../constants/settingsTokens";

import { SettingsFormCard } from "./SettingsFormCard";
import { SettingsNavRow } from "./SettingsNavRow";
import { SettingsSection } from "./SettingsSection";

export type SettingsTourRowData = {
  id: string;
  title: string;
  summary: string;
  /** "~25 s" */
  durationLabel: string;
  icon: TourIconSpec;
  seen: boolean;
};

export type SettingsToursEditorProps = {
  intro: string;
  rows: readonly SettingsTourRowData[];
  seenCount: number;
  total: number;
  allDone: boolean;
  /** Play the Tour master badge's shine (the first time it is seen). */
  masterShine: boolean;
  onPlay: (id: string) => void;
};

const CHECK_SIZE = 22;

/** The end of a tour's row: a check when it was seen, and what tapping does (Play, or Replay). */
const TourRowTrailing = memo(function TourRowTrailing({ seen }: { seen: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.trailing}>
      {seen ? (
        <View style={styles.check} accessibilityElementsHidden>
          <Check size={13} color={colors.onSuccess} strokeWidth={3} />
        </View>
      ) : null}
      <View style={styles.play}>
        <Play size={11} color={colors.accentText} strokeWidth={2.6} />
        <Text style={styles.playLabel}>{seen ? "Replay" : "Play"}</Text>
      </View>
    </View>
  );
});

/** Settings → Tours: how many tours are done, the Tour master badge, and every tour with a Play button. */
export const SettingsToursEditor = memo(function SettingsToursEditor({
  intro,
  rows,
  seenCount,
  total,
  allDone,
  masterShine,
  onPlay,
}: SettingsToursEditorProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <Text style={styles.intro}>{intro}</Text>

      <SettingsFormCard
        title={`${seenCount} of ${total} tours done`}
        subtitle="Each one takes under a minute and never changes your data."
      >
        <ProgressBar
          progress={total > 0 ? seenCount / total : 0}
          fillColor={colors.accent}
          backgroundColor={colors.surfaceSunken}
          height={6}
        />
      </SettingsFormCard>

      {allDone ? <TourMasterBadge shine={masterShine} /> : null}

      <SettingsSection title="All tours">
        {rows.map((row, index) => (
          <SettingsNavRow
            key={row.id}
            icon={resolveTourIcon(row.icon)}
            label={row.title}
            subtitle={`${row.durationLabel} · ${row.summary}`}
            accessibilityLabel={`${row.title} tour, ${row.durationLabel}${row.seen ? ", done" : ""}`}
            onPress={() => onPlay(row.id)}
            trailing={<TourRowTrailing seen={row.seen} />}
            showSeparator={index < rows.length - 1}
          />
        ))}
      </SettingsSection>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    gap: SETTINGS_SECTION_GAP,
  },
  intro: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  check: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success,
  },
  play: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.accentTint,
  },
  playLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.accentText,
  },
}));
