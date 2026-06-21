import { memo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from "react-native";

import {
  BUTTON_LOADER_SIZE,
  InfinityButtonLoader,
} from "@/components/ui/InfinityButtonLoader";

import {
  bento,
  colors,
  overlays,
  radius,
  spacing,
  surfaces,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";

import { TwoToneCard } from "./TwoToneCard";

type ModalActionButtonProps = Omit<PressableProps, "style" | "children"> & {
  title: string;
  variant: "secondary" | "primary" | "danger";
  loading?: boolean;
};

function ModalActionButton({
  title,
  variant,
  loading = false,
  disabled,
  onPress,
  ...rest
}: ModalActionButtonProps) {
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const isDisabled = disabled || loading;

  const backgroundColor = isPrimary
    ? isDisabled
      ? `${colors.primary}99`
      : colors.primary
    : isDanger
      ? isDisabled
        ? surfaces.dangerTint06
        : surfaces.dangerTint08
      : colors.barBackground;

  const borderWidth = isPrimary ? 0 : StyleSheet.hairlineWidth;
  const borderColor = isDanger ? colors.danger : colors.border;

  const labelColor = isPrimary
    ? colors.barBackground
    : isDanger
      ? colors.danger
      : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={(e) => {
        void triggerLightHaptic();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor,
          borderWidth,
          borderColor,
          opacity: pressed && !isDisabled ? 0.92 : 1,
        },
      ]}
      {...rest}
    >
      {loading ? (
        <InfinityButtonLoader color={labelColor} size={BUTTON_LOADER_SIZE} />
      ) : (
        <Text style={[styles.actionLabel, { color: labelColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export type TwoToneConfirmModalProps = {
  visible: boolean;
  title: string;
  message?: string | null;
  cancelLabel?: string;
  confirmLabel: string;
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

export const TwoToneConfirmModal = memo(function TwoToneConfirmModal({
  visible,
  title,
  message,
  cancelLabel = "Cancel",
  confirmLabel,
  confirmTone = "primary",
  onCancel,
  onConfirm,
  confirmLoading = false,
  confirmDisabled = false,
  loading = false,
  errorMessage = null,
  children,
}: TwoToneConfirmModalProps) {
  const confirmVariant =
    confirmTone === "danger" ? ("danger" as const) : ("primary" as const);

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
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal
        >
          <TwoToneCard
            header={
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
              </View>
            }
            body={
              <View style={styles.body}>
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={colors.primary} size="small" />
                  </View>
                ) : errorMessage ? (
                  <Text style={styles.errorText}>{errorMessage}</Text>
                ) : message ? (
                  <Text style={styles.message}>{message}</Text>
                ) : null}

                {children ? (
                  <View style={styles.children}>{children}</View>
                ) : null}

                <View style={styles.actions}>
                  <View style={styles.actionSlot}>
                    <ModalActionButton
                      title={cancelLabel}
                      variant="secondary"
                      onPress={onCancel}
                      disabled={confirmLoading}
                    />
                  </View>
                  <View style={styles.actionSlot}>
                    <ModalActionButton
                      title={confirmLabel}
                      variant={confirmVariant}
                      loading={confirmLoading}
                      disabled={confirmDisabled}
                      onPress={onConfirm}
                    />
                  </View>
                </View>
              </View>
            }
          />
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
    paddingHorizontal: spacing.lg,
  },
  cardShell: {
    width: "100%",
    maxWidth: 340,
    alignSelf: "center",
  },
  header: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: bento.onPastel.primary,
    textAlign: "center",
  },
  body: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  message: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: "center",
  },
  errorText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
    textAlign: "center",
  },
  loadingRow: {
    paddingVertical: spacing.xs,
    alignItems: "center",
  },
  children: {
    width: "100%",
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionSlot: {
    flex: 1,
  },
  actionButton: {
    minHeight: 40,
    borderRadius: radius.sm + 2,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 18,
  },
});
