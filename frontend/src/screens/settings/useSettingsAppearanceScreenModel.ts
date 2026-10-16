import { useCallback, useState } from "react";
import { Platform } from "react-native";

import {
  getHideWidgetAmounts,
  setHideWidgetAmounts,
} from "@/lib/widgets/widgetPreferences";
import { useThemePreference } from "@/theme";
import { refreshWidgets } from "@/widgets/refreshWidgets";

export function useSettingsAppearanceScreenModel() {
  const { preference, setPreference } = useThemePreference();
  const [hideWidgetAmounts, setHideWidgetAmountsState] = useState(getHideWidgetAmounts);

  const onHideWidgetAmountsChange = useCallback((hide: boolean) => {
    setHideWidgetAmounts(hide);
    setHideWidgetAmountsState(hide);
    refreshWidgets();
  }, []);

  return {
    editorProps: {
      preference,
      onSelect: setPreference,
      // The widget exists on Android only.
      ...(Platform.OS === "android"
        ? { hideWidgetAmounts, onHideWidgetAmountsChange }
        : {}),
    },
  };
}
