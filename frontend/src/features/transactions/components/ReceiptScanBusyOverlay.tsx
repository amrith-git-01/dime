import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/constants/theme";
import { useReceiptScanUiStore } from "@/stores/receiptScanUiStore";

export function ReceiptScanBusyOverlay() {
  const visible = useReceiptScanUiStore((s) => s.visible);
  const message = useReceiptScanUiStore((s) => s.message);

  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={colors.primary} />
          {message.length > 0 ? (
            <Text style={styles.text}>{message}</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.barBackground,
    borderRadius: 20,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
    maxWidth: 280,
  },
  text: {
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: "center",
  },
});
