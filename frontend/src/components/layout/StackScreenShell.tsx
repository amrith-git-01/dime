import { createContext, useContext, useState, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing } from "@/constants";
import { createThemedStyles } from "@/theme";

import { OverlayHost } from "./OverlayHost";

const DEFAULT_BOTTOM_OFFSET = 24;

const NOOP = () => {};

const KeyboardRoomContext = createContext<(room: number) => void>(NOOP);

/**
 * Asks the screen to keep `room` px free between the focused input and the keyboard (e.g. for a dropdown under
 * it); 0 releases it. A no-op outside a stack screen.
 */
export function useKeyboardRoom(): (room: number) => void {
  return useContext(KeyboardRoomContext);
}

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
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  // keyboard-controller re-scrolls whenever `bottomOffset` changes, so the room takes effect while the keyboard is up.
  const [keyboardRoom, setKeyboardRoom] = useState(0);
  const bodyStyle: StyleProp<ViewStyle> = [
    styles.scrollContent,
    { paddingBottom: spacing.xl + insets.bottom },
    contentContainerStyle,
  ];

  if (!scrollEnabled) {
    return <View style={styles.screen}>{children}</View>;
  }

  return (
    <KeyboardAwareScrollView
      style={styles.screen}
      contentContainerStyle={bodyStyle}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      bottomOffset={bottomOffset + keyboardRoom}
    >
      <KeyboardRoomContext.Provider value={setKeyboardRoom}>
        <OverlayHost>{children}</OverlayHost>
      </KeyboardRoomContext.Provider>
    </KeyboardAwareScrollView>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
}));
