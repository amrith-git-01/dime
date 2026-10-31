import { memo } from "react";
import { Text, View } from "react-native";

import { SegmentChip, TextField } from "@/components/ui";
import { fontFamilies, spacing } from "@/constants";
import { LeadDayChips } from "@/features/reminders/components";
import { REMINDER_LEAD_DAY_OPTIONS } from "@/features/reminders/constants";
import { createThemedStyles } from "@/theme";

import { SETTINGS_FORM_GAP } from "../constants/settingsTokens";
import { SettingsFormCard } from "./SettingsFormCard";
import { SettingsTimeRow } from "./SettingsTimeRow";
import { SettingsToggleRow } from "./SettingsToggleRow";

export type SettingsRemindersCardProps = {
  enabled: boolean;
  defaultLeadDays: readonly number[];
  time: string;
  overdueNudges: number;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  hideAmounts: boolean;
  /** My UPI ID as typed; empty when none. */
  upiId: string;
  upiError?: string | null;
  disabled?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onDefaultLeadDayToggle: (day: number) => void;
  onTimeChange: (time: string) => void;
  onOverdueNudgesChange: (count: number) => void;
  onQuietEnabledChange: (enabled: boolean) => void;
  onQuietStartChange: (time: string) => void;
  onQuietEndChange: (time: string) => void;
  onHideAmountsChange: (hide: boolean) => void;
  onUpiIdChange: (text: string) => void;
  onAnimationBusyChange?: (busy: boolean) => void;
};

const NUDGE_OPTIONS = [0, 1, 2, 3, 4, 5] as const;

function nudgeLabel(count: number): string {
  return count === 0 ? "Off" : String(count);
}

function nudgeAccessibilityLabel(count: number): string {
  if (count === 0) {
    return "No overdue nudges";
  }
  return count === 1 ? "1 overdue nudge" : `${count} overdue nudges`;
}

/** Settings → Notifications: money reminders (when, how early, quiet hours) and my UPI ID. */
export const SettingsRemindersCard = memo(function SettingsRemindersCard({
  enabled,
  defaultLeadDays,
  time,
  overdueNudges,
  quietEnabled,
  quietStart,
  quietEnd,
  hideAmounts,
  upiId,
  upiError,
  disabled = false,
  onEnabledChange,
  onDefaultLeadDayToggle,
  onTimeChange,
  onOverdueNudgesChange,
  onQuietEnabledChange,
  onQuietStartChange,
  onQuietEndChange,
  onHideAmountsChange,
  onUpiIdChange,
  onAnimationBusyChange,
}: SettingsRemindersCardProps) {
  const styles = useStyles();

  return (
    <SettingsFormCard
      title="Reminders"
      subtitle="Bills to pay and money to collect."
    >
      <SettingsToggleRow
        label="Reminders"
        subtitle="A push before something is due, and again if it is late."
        value={enabled}
        onValueChange={onEnabledChange}
        disabled={disabled}
        onAnimationBusyChange={onAnimationBusyChange}
      />

      {enabled ? (
        <>
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Remind me</Text>
            <Text style={styles.blockHint}>
              {defaultLeadDays.length > 0
                ? "Days before the due date, for new reminders."
                : "No default days. Each reminder can still pick its own."}
            </Text>
            <LeadDayChips
              options={REMINDER_LEAD_DAY_OPTIONS}
              selected={defaultLeadDays}
              onToggle={onDefaultLeadDayToggle}
              disabled={disabled}
            />
          </View>

          <SettingsTimeRow
            label="Reminder time"
            time={time}
            disabled={disabled}
            onTimeChange={onTimeChange}
          />

          <View style={styles.block}>
            <Text style={styles.blockLabel}>Nudges after the due date</Text>
            <Text style={styles.blockHint}>
              How many times Dime reminds you once something is late.
            </Text>
            <View style={styles.nudgeRow}>
              {NUDGE_OPTIONS.map((count) => (
                <View key={count} style={styles.nudgeCell}>
                  <SegmentChip
                    label={nudgeLabel(count)}
                    accessibilityLabel={nudgeAccessibilityLabel(count)}
                    selected={overdueNudges === count}
                    disabled={disabled}
                    onPress={() => onOverdueNudgesChange(count)}
                  />
                </View>
              ))}
            </View>
          </View>

          <SettingsToggleRow
            label="Quiet hours"
            subtitle="Hold reminders until the quiet period ends."
            value={quietEnabled}
            onValueChange={onQuietEnabledChange}
            disabled={disabled}
            onAnimationBusyChange={onAnimationBusyChange}
          />
          {quietEnabled ? (
            <View style={styles.quietRow}>
              <View style={styles.quietCell}>
                <SettingsTimeRow
                  label="Quiet from"
                  time={quietStart}
                  disabled={disabled}
                  onTimeChange={onQuietStartChange}
                />
              </View>
              <View style={styles.quietCell}>
                <SettingsTimeRow
                  label="Until"
                  time={quietEnd}
                  disabled={disabled}
                  onTimeChange={onQuietEndChange}
                />
              </View>
            </View>
          ) : null}

          <SettingsToggleRow
            label="Hide amounts in notifications"
            subtitle="Notifications say to open Dime instead of showing the amount. The app still shows it."
            value={hideAmounts}
            onValueChange={onHideAmountsChange}
            disabled={disabled}
            onAnimationBusyChange={onAnimationBusyChange}
          />
        </>
      ) : null}

      <View style={styles.block}>
        <TextField
          label="My UPI ID (optional)"
          placeholder="name@bank"
          value={upiId}
          onChangeText={onUpiIdChange}
          maxLength={100}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!disabled}
          errorMessage={upiError ?? null}
        />
        <Text style={styles.blockHint}>
          Nudges to people who owe you include a pay link for this ID.
        </Text>
      </View>
    </SettingsFormCard>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  block: {
    gap: spacing.sm,
  },
  blockLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  blockHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  nudgeRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  nudgeCell: {
    flex: 1,
    minWidth: 0,
  },
  quietRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: -SETTINGS_FORM_GAP / 2,
  },
  quietCell: {
    flex: 1,
    minWidth: 0,
  },
}));
