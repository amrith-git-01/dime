import { Camera, Edit3, Mic } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { ink, surface } from "@/constants/colors";
import { springs } from "@/constants/motion";
import { shadows } from "@/constants/shadows";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";
import { useVoiceCaptureUiStore } from "@/stores/voiceCaptureUiStore";

import { ACTION_BUBBLE_SIZE, OPTION_BUBBLE_SIZE } from "./dimeTabBarConfig";

type DimeTabBarFabActionsProps = {
  onManualAddPress: () => void;
  /** Starts the receipt camera flow (owned by the transactions feature). */
  onCaptureReceiptPress: () => void;
  /** Restarts the idle-close countdown when the user touches an action. */
  onPressIn: () => void;
};

/** Radial manual / photo / voice bubbles that fan out above the center FAB. */
export function DimeTabBarFabActions({
  onManualAddPress,
  onCaptureReceiptPress,
  onPressIn,
}: DimeTabBarFabActionsProps) {
  const fabOpen = useAddTransactionFabStore((s) => s.fabOpen);
  const setFabOpen = useAddTransactionFabStore((s) => s.setFabOpen);
  const openVoiceCapture = useVoiceCaptureUiStore((s) => s.open);
  const actionsProgress = useSharedValue(0);

  useEffect(() => {
    actionsProgress.value = withSpring(fabOpen ? 1 : 0, springs.fabActions);
  }, [actionsProgress, fabOpen]);

  const manualActionStyle = useAnimatedStyle(() => ({
    opacity: actionsProgress.value,
    transform: [
      { translateX: interpolate(actionsProgress.value, [0, 1], [0, -52]) },
      { translateY: interpolate(actionsProgress.value, [0, 1], [12, -38]) },
      { scale: interpolate(actionsProgress.value, [0, 1], [0.92, 1]) },
    ],
  }));

  const photoActionStyle = useAnimatedStyle(() => ({
    opacity: actionsProgress.value,
    transform: [
      { translateY: interpolate(actionsProgress.value, [0, 1], [12, -58]) },
      { scale: interpolate(actionsProgress.value, [0, 1], [0.92, 1]) },
    ],
  }));

  const voiceActionStyle = useAnimatedStyle(() => ({
    opacity: actionsProgress.value,
    transform: [
      { translateX: interpolate(actionsProgress.value, [0, 1], [0, 52]) },
      { translateY: interpolate(actionsProgress.value, [0, 1], [12, -38]) },
      { scale: interpolate(actionsProgress.value, [0, 1], [0.92, 1]) },
    ],
  }));

  return (
    <View
      pointerEvents={fabOpen ? "box-none" : "none"}
      style={styles.actionsRow}
    >
      <Animated.View style={[styles.actionBubble, manualActionStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add transaction manually"
          disabled={!fabOpen}
          hitSlop={{ top: 20, bottom: 20, left: 64, right: 20 }}
          onPressIn={onPressIn}
          onPress={() => {
            void triggerHaptic();
            setFabOpen(false);
            onManualAddPress();
          }}
          style={styles.radialActionHit}
        >
          <Edit3 size={20} color={surface} strokeWidth={2} />
        </Pressable>
      </Animated.View>

      <Animated.View style={[styles.actionBubble, photoActionStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add transaction from photo"
          disabled={!fabOpen}
          hitSlop={{ top: 56, bottom: 4, left: 20, right: 20 }}
          onPressIn={onPressIn}
          onPress={() => {
            void triggerHaptic();
            setFabOpen(false);
            onCaptureReceiptPress();
          }}
          style={styles.radialActionHit}
        >
          <Camera size={20} color={surface} strokeWidth={2} />
        </Pressable>
      </Animated.View>

      <Animated.View style={[styles.actionBubble, voiceActionStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add transaction with voice"
          disabled={!fabOpen}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 64 }}
          onPressIn={onPressIn}
          onPress={() => {
            void triggerHaptic();
            setFabOpen(false);
            openVoiceCapture();
          }}
          style={styles.radialActionHit}
        >
          <Mic size={20} color={surface} strokeWidth={2} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    position: "absolute",
    bottom: ACTION_BUBBLE_SIZE - 14,
    left: "50%",
    marginLeft: -(OPTION_BUBBLE_SIZE / 2),
    width: OPTION_BUBBLE_SIZE,
    height: OPTION_BUBBLE_SIZE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  actionBubble: {
    position: "absolute",
    width: OPTION_BUBBLE_SIZE,
    height: OPTION_BUBBLE_SIZE,
    borderRadius: OPTION_BUBBLE_SIZE / 2,
    backgroundColor: ink,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.fab,
  },
  radialActionHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
