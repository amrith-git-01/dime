import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ProgressBar, SkeletonBlock } from "@/components/ui";
import { fontFamilies, spacing } from "@/constants";
import { SettingsSection } from "@/features/settings/components";

import type { LimitCounter } from "../types";
import { useLimitsQuery } from "../hooks/useLimitsQuery";
import {
  formatLeft,
  formatResetsAt,
  MANUAL_ENTRY_FREE_NOTE,
} from "../utils/limitsFormat";
import { createThemedStyles } from "@/theme";

type LimitRowProps = {
  label: string;
  counter: LimitCounter;
  showSeparator?: boolean;
};

const LimitRow = memo(function LimitRow({
  label,
  counter,
  showSeparator = false,
}: LimitRowProps) {
  const styles = useStyles();
  const used = counter.limit > 0 ? counter.used / counter.limit : 1;
  return (
    <View>
      <View style={styles.row}>
        <View style={styles.rowTop}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{formatLeft(counter)}</Text>
        </View>
        <ProgressBar progress={used} height={6} />
      </View>
      {showSeparator ? <View style={styles.separator} /> : null}
    </View>
  );
});

/** Settings hub block: today's agent / receipt / voice allowances and when they reset. */
export const TodaysLimitsSection = memo(function TodaysLimitsSection() {
  const styles = useStyles();
  const { data, isPending, isError } = useLimitsQuery();

  return (
    <SettingsSection title="Today's limits">
      <View style={styles.inner}>
        {data ? (
          <>
            <LimitRow
              label="Dime Agent questions"
              counter={data.agent_questions}
              showSeparator
            />
            <LimitRow
              label="Receipt scans"
              counter={data.receipt_scans}
              showSeparator
            />
            <LimitRow label="Voice notes" counter={data.voice_captures} />
            {data.scanning_paused ? (
              <Text style={styles.paused}>
                Receipt and voice capture are paused right now.
              </Text>
            ) : null}
            <Text style={styles.hint}>
              Resets {formatResetsAt(data.resets_at)}. {MANUAL_ENTRY_FREE_NOTE}
            </Text>
          </>
        ) : isPending ? (
          <View style={styles.skeleton}>
            <SkeletonBlock style={styles.skeletonLine} />
            <SkeletonBlock style={styles.skeletonLine} />
            <SkeletonBlock style={styles.skeletonLine} />
          </View>
        ) : (
          <Text style={styles.hint}>
            {isError
              ? "Could not load today's limits right now."
              : MANUAL_ENTRY_FREE_NOTE}
          </Text>
        )}
      </View>
    </SettingsSection>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  inner: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  label: {
    flex: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  value: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginTop: spacing.sm,
  },
  paused: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.warning,
  },
  hint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  skeleton: {
    gap: spacing.md,
  },
  skeletonLine: {
    height: 36,
    borderRadius: 8,
  },
}));
