import { X } from "lucide-react-native";
import { memo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ButtonBusyContent } from "@/components/ui";
import {
  accent,
  danger,
  ink,
  inkSoft,
  line,
  overlays,
  radius,
  shadows,
  spacing,
  surface,
  typography,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

export type ConfirmModalProps = {
  visible: boolean;
  title: string;
  message?: string | null;
  cancelLabel?: string;
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

type ModalActionButtonProps = {
  label: string;
  busyLabel?: string;
  variant: "secondary" | "primary" | "danger";
  flex?: number;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

function ModalActionButton({
  label,
  busyLabel,
  variant,
  flex = 1,
  loading = false,
  disabled = false,
  onPress,
}: ModalActionButtonProps) {
  const isSecondary = variant === "secondary";
  const isDanger = variant === "danger";
  const isDisabled = disabled || loading;

  const backgroundColor = isSecondary ? surface : isDanger ? danger : accent;

  const labelColor = isSecondary ? ink : surface;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={() => {
        void triggerHaptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.actionButton,
        { flex, backgroundColor },
        isSecondary && styles.actionButtonSecondary,
        isDisabled && styles.actionButtonDisabled,
        pressed && !isDisabled && styles.actionButtonPressed,
      ]}
    >
      <ButtonBusyContent
        loading={loading}
        label={label}
        busyLabel={busyLabel}
        color={labelColor}
        textStyle={styles.actionLabel}
      />
    </Pressable>
  );
}

export const ConfirmModal = memo(function ConfirmModal({
  visible,
  title,
  message,
  cancelLabel = "Cancel",
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
                <X color={inkSoft} size={20} strokeWidth={1.5} />
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
                    <ActivityIndicator size="small" color={accent} />
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
              <ModalActionButton
                label={cancelLabel}
                variant="secondary"
                flex={1}
                onPress={onCancel}
                disabled={confirmLoading}
              />
              <ModalActionButton
                label={confirmLabel}
                busyLabel={confirmBusyLabel}
                variant={confirmVariant}
                flex={2}
                loading={confirmLoading}
                disabled={confirmDisabled}
                onPress={onConfirm}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: overlays.scrim,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  cardShell: {
    width: "100%",
    maxWidth: 320,
  },
  card: {
    backgroundColor: surface,
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
    color: inkSoft,
    textAlign: "left",
  },
  errorText: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    color: danger,
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
  actionButton: {
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  actionButtonSecondary: {
    borderWidth: 1,
    borderColor: line,
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  actionButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  actionLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
  },
});
