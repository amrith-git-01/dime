import { useThemePreference } from "@/theme";

export function useSettingsAppearanceScreenModel() {
  const { preference, setPreference } = useThemePreference();

  return {
    editorProps: {
      preference,
      onSelect: setPreference,
    },
  };
}
