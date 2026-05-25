import type { ReactNode } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/constants/theme";

export type ScreenContainerProps = ViewProps & {
  children: ReactNode;
};

/**
 * Root wrapper for full-screen views so content stays below the status bar
 * (edge-to-edge / translucent status bar on Android and iOS).
 */
export function ScreenContainer({
  children,
  style,
  ...rest
}: ScreenContainerProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
});
