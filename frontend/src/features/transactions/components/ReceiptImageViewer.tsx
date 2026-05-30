import { cacheDirectory, downloadAsync } from "expo-file-system/legacy";
import { Image } from "expo-image";
import * as Sharing from "expo-sharing";
import { Share2, X } from "lucide-react-native";
import { useCallback, useEffect } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, overlays, spacing } from "@/constants/theme";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_SPRING = { damping: 20, stiffness: 220 };

type ReceiptImageViewerProps = {
  url: string;
  visible: boolean;
  onClose: () => void;
};

function guessReceiptExtension(url: string): "jpg" | "png" | "webp" {
  const lower = url.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".png")) {
    return "png";
  }
  if (lower.endsWith(".webp")) {
    return "webp";
  }
  return "jpg";
}

export function ReceiptImageViewer({
  url,
  visible,
  onClose,
}: ReceiptImageViewerProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const resetTransform = useCallback(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
  }, [savedScale, scale, translateX, translateY]);

  useEffect(() => {
    if (!visible) {
      resetTransform();
    }
  }, [resetTransform, visible]);

  const handleClose = useCallback(() => {
    void triggerLightHaptic();
    onClose();
  }, [onClose]);

  const handleShare = useCallback(async () => {
    void triggerLightHaptic();
    try {
      const extension = guessReceiptExtension(url);
      if (!cacheDirectory) {
        throw new Error("Cache unavailable");
      }
      const localUri = `${cacheDirectory}receipt-share-${Date.now()}.${extension}`;
      const download = await downloadAsync(url, localUri);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(download.uri, {
          mimeType: `image/${extension === "jpg" ? "jpeg" : extension}`,
          dialogTitle: "Share receipt",
        });
        return;
      }

      const { Share } = await import("react-native");
      await Share.share({
        message: url,
        title: "Share receipt",
        url: download.uri,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not share receipt.";
      Alert.alert("Share failed", message);
    }
  }, [url]);

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      const next = savedScale.value * event.scale;
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE * 0.5, next));
    })
    .onEnd(() => {
      if (scale.value < MIN_SCALE) {
        scale.value = withSpring(MIN_SCALE, ZOOM_SPRING);
        savedScale.value = MIN_SCALE;
        translateX.value = withSpring(0, ZOOM_SPRING);
        translateY.value = withSpring(0, ZOOM_SPRING);
        return;
      }
      if (scale.value > MAX_SCALE) {
        scale.value = withSpring(MAX_SCALE, ZOOM_SPRING);
        savedScale.value = MAX_SCALE;
        return;
      }
      savedScale.value = scale.value;
    });

  const pan = Gesture.Pan()
    .onBegin(() => {
      panStartX.value = translateX.value;
      panStartY.value = translateY.value;
    })
    .onUpdate((event) => {
      if (scale.value <= MIN_SCALE) {
        return;
      }
      translateX.value = panStartX.value + event.translationX;
      translateY.value = panStartY.value + event.translationY;
    });

  const composed = Gesture.Simultaneous(pinch, pan);

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const viewportHeight = windowHeight - insets.top - insets.bottom;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.viewerRoot}>
        <View
          style={[
            styles.topBar,
            {
              paddingTop: insets.top + spacing.sm,
              paddingHorizontal: spacing.lg,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share receipt photo"
            onPress={() => {
              void handleShare();
            }}
            style={({ pressed }) => [
              styles.topBarButton,
              pressed && styles.topBarButtonPressed,
            ]}
          >
            <Share2 size={20} color={colors.textOnPrimary} strokeWidth={2} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close receipt photo"
            onPress={handleClose}
            style={({ pressed }) => [
              styles.topBarButton,
              pressed && styles.topBarButtonPressed,
            ]}
          >
            <X size={22} color={colors.textOnPrimary} strokeWidth={2} />
          </Pressable>
        </View>

        <GestureDetector gesture={composed}>
          <Animated.View
            style={[
              styles.imageStage,
              { width: windowWidth, height: viewportHeight },
              imageAnimatedStyle,
            ]}
          >
            <Image
              source={{ uri: url }}
              style={{ width: windowWidth, height: viewportHeight }}
              contentFit="contain"
              accessibilityLabel="Receipt image full size"
              placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
            />
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewerRoot: {
    flex: 1,
    backgroundColor: overlays.scrim,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.sm,
  },
  topBarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarButtonPressed: {
    opacity: 0.88,
  },
  imageStage: {
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
  },
});
