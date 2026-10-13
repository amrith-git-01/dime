import { StyleSheet, Text } from "react-native";

import { darkTheme, lightTheme } from "../palettes";
import { ThemeProvider, useTheme, useThemePreference } from "../ThemeProvider";
import { createThemedStyles } from "../useThemedStyles";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => void) => void;
  create: (element: React.ReactElement) => {
    update: (element: React.ReactElement) => void;
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const build = jest.fn(({ colors }: typeof lightTheme) => ({
  box: { backgroundColor: colors.surface, padding: 4 },
}));
const useStyles = createThemedStyles(build);

describe("createThemedStyles", () => {
  beforeEach(() => build.mockClear());

  it("returns the identical StyleSheet for repeated calls with the same scheme", () => {
    const first = useStyles.forTheme(lightTheme);
    expect(useStyles.forTheme(lightTheme)).toBe(first);
    expect(useStyles.forTheme(lightTheme)).toBe(first);
  });

  it("builds once per scheme, not per call", () => {
    const fresh = jest.fn(() => ({ box: { padding: 1 } }));
    const useFresh = createThemedStyles(fresh);
    for (let i = 0; i < 5; i += 1) {
      useFresh.forTheme(lightTheme);
      useFresh.forTheme(darkTheme);
    }
    expect(fresh).toHaveBeenCalledTimes(2);
  });

  it("gives each scheme its own palette", () => {
    const light = StyleSheet.flatten(useStyles.forTheme(lightTheme).box);
    const dark = StyleSheet.flatten(useStyles.forTheme(darkTheme).box);
    expect(light.backgroundColor).toBe(lightTheme.colors.surface);
    expect(dark.backgroundColor).toBe(darkTheme.colors.surface);
  });
});

describe("ThemeProvider", () => {
  it("keeps the theme and styles referentially stable until the scheme changes", () => {
    const themes: unknown[] = [];
    const sheets: unknown[] = [];
    let setPreference: ReturnType<typeof useThemePreference>["setPreference"] =
      () => undefined;

    function Probe() {
      themes.push(useTheme());
      sheets.push(useStyles());
      setPreference = useThemePreference().setPreference;
      return <Text>probe</Text>;
    }

    let renderer: ReturnType<typeof create> | undefined;
    act(() => {
      renderer = create(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
      );
    });

    act(() => renderer?.update(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    ));
    expect(themes.every((theme) => theme === themes[0])).toBe(true);
    expect(sheets.every((sheet) => sheet === sheets[0])).toBe(true);

    const before = themes.length;
    act(() => setPreference("dark"));
    expect(themes[themes.length - 1]).toBe(darkTheme);
    expect(sheets[sheets.length - 1]).not.toBe(sheets[0]);
    // One render for the preference change, not a cascade.
    expect(themes.length - before).toBeLessThanOrEqual(2);

    act(() => setPreference("light"));
    expect(themes[themes.length - 1]).toBe(lightTheme);
    expect(sheets[sheets.length - 1]).toBe(sheets[0]);
  });
});
