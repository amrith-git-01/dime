import type { ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, spacing } from "@/constants";

const DEFAULT_BOTTOM_OFFSET = 24;

export type StackScreenShellProps = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bottomOffset?: number;
  showsVerticalScrollIndicator?: boolean;
  /** Disable when the screen has no keyboard fields (e.g. Auth carousel). */
  scrollEnabled?: boolean;
};

/**
 * Standard body chrome for stack-pushed screens (below React Navigation header).
 */
export function StackScreenShell({
  children,
  contentContainerStyle,
  bottomOffset = DEFAULT_BOTTOM_OFFSET,
  showsVerticalScrollIndicator = false,
  scrollEnabled = true,
}: StackScreenShellProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAwareScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: spacing.xl + insets.bottom },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      bottomOffset={bottomOffset}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
});
