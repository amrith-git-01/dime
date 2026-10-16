import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { spacing } from "@/constants";
import {
  THEME_PREFERENCES,
  THEME_PREFERENCE_LABELS,
  type ThemePreference,
} from "@/theme";

import { SettingsFormCard } from "./SettingsFormCard";
import { SettingsOptionRow } from "./SettingsOptionRow";
import { SettingsToggleRow } from "./SettingsToggleRow";

export type SettingsAppearanceEditorProps = {
  preference: ThemePreference;
  onSelect: (preference: ThemePreference) => void;
  /** Android only: omit both to hide the home-screen widget privacy card. */
  hideWidgetAmounts?: boolean;
  onHideWidgetAmountsChange?: (hide: boolean) => void;
};

const OPTION_SUBTITLES: Readonly<Record<ThemePreference, string>> = {
  system: "Match this device's light or dark setting.",
  light: "Always use the light theme.",
  dark: "Always use the dark theme.",
};

/** Applies on tap: the theme and the widget privacy switch are device preferences, so there is nothing to save. */
export const SettingsAppearanceEditor = memo(function SettingsAppearanceEditor({
  preference,
  onSelect,
  hideWidgetAmounts,
  onHideWidgetAmountsChange,
}: SettingsAppearanceEditorProps) {
  return (
    <View style={styles.root}>
      <SettingsFormCard
        title="Theme"
        subtitle="Choose how Dime looks on this device."
      >
        {THEME_PREFERENCES.map((option, index) => (
          <SettingsOptionRow
            key={option}
            label={THEME_PREFERENCE_LABELS[option]}
            subtitle={OPTION_SUBTITLES[option]}
            selected={preference === option}
            onPress={() => onSelect(option)}
            showSeparator={index < THEME_PREFERENCES.length - 1}
          />
        ))}
      </SettingsFormCard>

      {onHideWidgetAmountsChange ? (
        <SettingsFormCard title="Home screen widget">
          <SettingsToggleRow
            label="Hide amounts on widget"
            subtitle="Show ₹ •••• instead of your amounts on the home screen."
            value={hideWidgetAmounts ?? false}
            onValueChange={onHideWidgetAmountsChange}
          />
        </SettingsFormCard>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
  },
});
