import { X } from "lucide-react-native";
import { memo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { Button } from "@/components/ui";
import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles, useTheme } from "@/theme";

export type ConfirmModalProps = {
  visible: boolean;
  title: string;
  message?: string | null;
  cancelLabel?: string;
  /** False leaves only the confirm button (a how-to with a single "Done"). */
  showCancel?: boolean;
  confirmLabel: string;
  /** Continuous-tense confirm label while busy ("Deleting"); derived from `confirmLabel` when omitted. */
  confirmBusyLabel?: string;
  confirmTone?: "primary" | "danger";
  onCancel: () => void;
  onConfirm: () => void;
  confirmLoading?: boolean;
  confirmDisabled?: boolean;
  /** When true, shows a spinner in the body instead of the message. */
  loading?: boolean;
  errorMessage?: string | null;
  children?: ReactNode;
};

export const ConfirmModal = memo(function ConfirmModal({
  visible,
  title,
  message,
  cancelLabel = "Cancel",
  showCancel = true,
  confirmLabel,
  confirmBusyLabel,
  confirmTone = "primary",
  onCancel,
  onConfirm,
  confirmLoading = false,
  confirmDisabled = false,
  loading = false,
  errorMessage = null,
  children,
}: ConfirmModalProps) {
  const { colors, shadows } = useTheme();
  const styles = useStyles();
  const confirmVariant =
    confirmTone === "danger" ? ("danger" as const) : ("primary" as const);

  const hasBodyContent =
    loading || Boolean(errorMessage) || Boolean(message) || Boolean(children);

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onCancel}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Dismiss dialog"
      >
        <Pressable
          style={styles.cardShell}
          onPress={(event) => event.stopPropagation()}
          accessibilityViewIsModal
        >
          <View style={[styles.card, shadows.cardElevated]}>
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={2}>
                {title}
              </Text>
              <Pressable
                onPress={onCancel}
                disabled={confirmLoading}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.closeButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
              >
                <X color={colors.inkSoft} size={20} strokeWidth={1.5} />
              </Pressable>
            </View>

            {hasBodyContent ? (
              <ScrollView
                style={styles.bodyScroll}
                contentContainerStyle={styles.bodyContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
                keyboardShouldPersistTaps="handled"
              >
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={colors.accentText} />
                  </View>
                ) : errorMessage ? (
                  <Text style={styles.errorText}>{errorMessage}</Text>
                ) : message ? (
                  <Text style={styles.message}>{message}</Text>
                ) : null}

                {children ? (
                  <View style={styles.children}>{children}</View>
                ) : null}
              </ScrollView>
            ) : null}

            <View style={styles.footer}>
              {showCancel ? (
                <View style={styles.cancelSlot}>
                  <Button
                    title={cancelLabel}
                    variant="secondary"
                    onPress={onCancel}
                    disabled={confirmLoading}
                  />
                </View>
              ) : null}
              <View style={styles.confirmSlot}>
                <Button
                  title={confirmLabel}
                  busyLabel={confirmBusyLabel}
                  variant={confirmVariant}
                  loading={confirmLoading}
                  disabled={confirmDisabled}
                  onPress={onConfirm}
                />
              </View>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const useStyles = createThemedStyles(({ colors, typography }) => ({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlays.scrim,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  cardShell: {
    width: "100%",
    maxWidth: 320,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
  closeButtonPressed: {
    opacity: 0.7,
  },
  bodyScroll: {
    maxHeight: 300,
  },
  bodyContent: {
    gap: spacing.md,
    alignItems: "stretch",
  },
  message: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
    textAlign: "left",
  },
  errorText: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.danger,
    textAlign: "left",
  },
  loadingRow: {
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  children: {
    width: "100%",
  },
  footer: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  cancelSlot: {
    flex: 1,
  },
  confirmSlot: {
    flex: 2,
  },
}));
