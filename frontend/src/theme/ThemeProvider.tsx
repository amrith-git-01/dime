import * as NavigationBar from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Platform, useColorScheme } from "react-native";

import { getTheme, lightTheme, type Theme } from "./palettes";
import {
  applyAppearanceOverride,
  getThemePreference,
  resolveScheme,
  setThemePreference,
  type ThemePreference,
} from "./themePreference";

/**
 * The theme is one frozen object per scheme (see `getTheme`), so this context only changes when
 * the resolved scheme does. Consumers re-render once on a scheme change and never otherwise.
 */
const ThemeContext = createContext<Theme>(lightTheme);

type ThemePreferenceValue = {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
};

/** Split from the theme so only the Appearance screen re-renders on a preference change. */
const ThemePreferenceContext = createContext<ThemePreferenceValue>({
  preference: "system",
  setPreference: () => undefined,
});

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export function useThemePreference(): ThemePreferenceValue {
  return useContext(ThemePreferenceContext);
}

/** Reads the stored choice and hands native chrome the override, synchronously, before paint. */
function readInitialPreference(): ThemePreference {
  const preference = getThemePreference();
  applyAppearanceOverride(preference);
  return preference;
}

/**
 * The only place that drives status bar, Android navigation bar and the root view background,
 * so no screen has to.
 */
function ThemeSystemBars() {
  const { scheme, colors } = useTheme();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.paper);
    if (Platform.OS === "android") {
      // Edge-to-edge: the bar is transparent; only the button contrast is settable.
      // "light" = light bar with dark buttons, "dark" = dark bar with light buttons.
      NavigationBar.setStyle(scheme);
    }
  }, [scheme, colors.paper]);

  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState(readInitialPreference);
  const systemScheme = useColorScheme();
  const theme = getTheme(resolveScheme(preference, systemScheme));

  const setPreference = useCallback((next: ThemePreference) => {
    setThemePreference(next);
    applyAppearanceOverride(next);
    setPreferenceState(next);
  }, []);

  const preferenceValue = useMemo(
    () => ({ preference, setPreference }),
    [preference, setPreference],
  );

  return (
    <ThemeContext.Provider value={theme}>
      <ThemePreferenceContext.Provider value={preferenceValue}>
        <ThemeSystemBars />
        {children}
      </ThemePreferenceContext.Provider>
    </ThemeContext.Provider>
  );
}
