import { X } from "lucide-react-native";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { FirstUseTip } from "@/features/onboarding/components";
import { useVoiceCaptureUiStore } from "@/stores/voiceCaptureUiStore";

import { useVoiceCaptureSession } from "@/features/transactions/hooks/useVoiceCaptureSession";
import { VoiceMiniWaveform } from "./VoiceMiniWaveform";
import { createThemedStyles, useTheme } from "@/theme";

/** Bottom “voice bar” host: Stitch-aligned tokens (Dime project), logic in `useVoiceCaptureSession`. */
export function VoiceCaptureBar() {
  const { colors } = useTheme();
  const styles = useStyles();
  const visible = useVoiceCaptureUiStore((s) => s.visible);
  const { phase, statusLine, stopAndSubmit, requestDismiss, stopEnabled } =
    useVoiceCaptureSession();
  const insets = useSafeAreaInsets();
  const tabBarOffset =
    spacing.tabBarHeight + Math.max(insets.bottom, spacing.sm);
  const bottomGap = spacing.md;

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={requestDismiss}
    >
      <View style={styles.modalRoot} pointerEvents="box-none">
        <Pressable
          style={styles.backdrop}
          onPress={requestDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss voice capture"
        />
        <View
          style={[styles.barWrap, { paddingBottom: tabBarOffset + bottomGap }]}
          pointerEvents="box-none"
        >
          <FirstUseTip
            tipId="voice"
            message="Say it naturally: “250 for lunch at Swiggy”"
            seenOnUnmount
            style={styles.tip}
          />
          <View style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={12}
              onPress={requestDismiss}
              style={styles.iconButton}
            >
              <X size={22} color={colors.inkSoft} strokeWidth={2} />
            </Pressable>

            <View style={styles.center}>
              {phase === "recording" ? (
                <VoiceMiniWaveform />
              ) : (
                <ActivityIndicator color={colors.accentText} />
              )}
              <Text style={styles.statusText}>{statusLine}</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop and save"
              disabled={!stopEnabled}
              onPress={() => {
                void stopAndSubmit();
              }}
              style={({ pressed }) => [
                styles.stopFab,
                !stopEnabled && styles.stopFabDisabled,
                pressed && stopEnabled && styles.stopFabPressed,
              ]}
            >
              <View style={styles.stopIcon} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlays.scrimLight,
  },
  barWrap: {
    paddingHorizontal: spacing.lg,
  },
  tip: {
    marginBottom: spacing.sm,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    ...shadows.cardElevated,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  statusText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    textAlign: "center",
  },
  stopFab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  stopFabDisabled: {
    opacity: 0.38,
  },
  stopFabPressed: {
    opacity: 0.92,
  },
  stopIcon: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: colors.onAccent,
  },
}));
