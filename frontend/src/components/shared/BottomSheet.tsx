import { X } from "lucide-react-native";
import { memo, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  inkSoft,
  overlays,
  radius,
  shadows,
  spacing,
  surface,
  typography,
} from "@/constants";

export type BottomSheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Blocks backdrop / close-button / back-button dismissal (e.g. while saving). */
  dismissDisabled?: boolean;
  children: ReactNode;
  /** Rendered inside the sheet's modal, so nested modals (confirm dialogs) stack above it. */
  overlay?: ReactNode;
};

/**
 * Bottom-anchored modal sheet: scrim, rounded surface, title row with close button, and a
 * keyboard-aware scrolling body (same keyboard handling as `StackScreenShell`).
 */
export const BottomSheet = memo(function BottomSheet({
  visible,
  title,
  onClose,
  dismissDisabled = false,
  children,
  overlay,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const handleClose = () => {
    if (!dismissDisabled) {
      onClose();
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={handleClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View
          style={[
            styles.sheet,
            shadows.cardElevated,
            { paddingBottom: Math.max(insets.bottom, spacing.lg) },
          ]}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <Pressable
              onPress={handleClose}
              disabled={dismissDisabled}
              hitSlop={8}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.closePressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X color={inkSoft} size={20} strokeWidth={1.5} />
            </Pressable>
          </View>
          <KeyboardAwareScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bottomOffset={24}
          >
            {children}
          </KeyboardAwareScrollView>
        </View>
      </KeyboardAvoidingView>
      {overlay}
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: overlays.scrim,
  },
  sheet: {
    maxHeight: "92%",
    backgroundColor: surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h2,
    flex: 1,
    fontSize: 20,
    lineHeight: 26,
    textAlign: "left",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  closePressed: {
    opacity: 0.7,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
});
