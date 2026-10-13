import { StyleSheet } from "react-native";

import type { Theme } from "./palettes";
import { useTheme } from "./ThemeProvider";

export type ThemedStylesHook<T> = (() => T) & {
  /** Same cached sheet the hook returns, for tests and non-hook callers. */
  forTheme: (theme: Theme) => T;
};

/**
 * Declares a component's styles once, at module level:
 *
 *   const useStyles = createThemedStyles(({ colors, shadows }) => ({ ... }));
 *   // in the component
 *   const styles = useStyles();
 *
 * `build` is pure. Its result is cached per scheme in a module Map, so it runs at most once per
 * scheme (twice for the app's lifetime) and the hook returns the identical StyleSheet object
 * for a given scheme: nothing is built during render.
 */
export function createThemedStyles<
  T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>,
>(build: (theme: Theme) => T & StyleSheet.NamedStyles<any>): ThemedStylesHook<T> {
  const cache = new Map<Theme["scheme"], T>();

  const forTheme = (theme: Theme): T => {
    let styles = cache.get(theme.scheme);
    if (!styles) {
      styles = StyleSheet.create(build(theme)) as T;
      cache.set(theme.scheme, styles);
    }
    return styles;
  };

  const useThemedStyles = () => forTheme(useTheme());
  useThemedStyles.forTheme = forTheme;
  return useThemedStyles;
}
