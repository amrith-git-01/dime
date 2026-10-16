import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius, spacing } from "@/constants";
import { createThemedStyles, useTheme } from "@/theme";

type CardFrameProps = {
  /** `sheet` is the quick-add card at the bottom; `pill` floats a little above the bottom edge. */
  variant: "sheet" | "pill";
  /** A tap outside the card. Omit while something must not be interrupted. */
  onBackdropPress?: () => void;
  children: ReactNode;
};

/** Pill sits above the launcher's dock and gesture bar, like a snackbar. */
const PILL_BOTTOM_OFFSET = 88;

/**
 * Where the capture card sits: over the (translucent) activity window, on top of the home screen.
 * The window itself is transparent and dimmed natively; this places the card and catches taps outside it.
 */
export function CardFrame({ variant, onBackdropPress, children }: CardFrameProps) {
  const styles = useStyles();
  const { shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const isSheet = variant === "sheet";

  return (
    <View style={styles.root}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onBackdropPress}
        disabled={!onBackdropPress}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <KeyboardAvoidingView
        behavior="padding"
        pointerEvents="box-none"
        style={isSheet ? styles.sheetSlot : styles.pillSlot}
      >
        <View
          style={[
            isSheet ? styles.sheet : styles.pill,
            isSheet ? shadows.sheet : shadows.pill,
            isSheet
              ? { paddingBottom: insets.bottom + spacing.lg }
              : { marginBottom: insets.bottom + PILL_BOTTOM_OFFSET },
          ]}
        >
          {children}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    flex: 1,
  },
  sheetSlot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  pillSlot: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.lg,
  },
  pill: {
    maxWidth: "92%",
    minHeight: 56,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
}));
