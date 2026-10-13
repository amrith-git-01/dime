import { ActivityIndicator, Modal, Text, View } from "react-native";

import { radius, spacing } from "@/constants";
import { useReceiptScanUiStore } from "@/stores/receiptScanUiStore";
import { createThemedStyles, useTheme } from "@/theme";

export function ReceiptScanBusyOverlay() {
  const { colors } = useTheme();
  const styles = useStyles();
  const visible = useReceiptScanUiStore((s) => s.visible);
  const message = useReceiptScanUiStore((s) => s.message);

  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={colors.accentText} />
          {message.length > 0 ? (
            <Text style={styles.text}>{message}</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlays.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
    maxWidth: 280,
  },
  text: {
    fontSize: 15,
    color: colors.ink,
    textAlign: "center",
  },
}));
