import { memo } from "react";

import {
  THEME_PREFERENCES,
  THEME_PREFERENCE_LABELS,
  type ThemePreference,
} from "@/theme";

import { SettingsFormCard } from "./SettingsFormCard";
import { SettingsOptionRow } from "./SettingsOptionRow";

export type SettingsAppearanceEditorProps = {
  preference: ThemePreference;
  onSelect: (preference: ThemePreference) => void;
};

const OPTION_SUBTITLES: Readonly<Record<ThemePreference, string>> = {
  system: "Match this device's light or dark setting.",
  light: "Always use the light theme.",
  dark: "Always use the dark theme.",
};

/** Applies on tap: the theme is a device preference, so there is nothing to save. */
export const SettingsAppearanceEditor = memo(function SettingsAppearanceEditor({
  preference,
  onSelect,
}: SettingsAppearanceEditorProps) {
  return (
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
  );
});
