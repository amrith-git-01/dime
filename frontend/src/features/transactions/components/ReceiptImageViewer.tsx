import { cacheDirectory, downloadAsync } from "expo-file-system/legacy";
import { Image } from "expo-image";
import { Share2, X } from "lucide-react-native";
import { useCallback, useEffect, useRef } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, overlays, spacing } from "@/constants";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

import {
  ReceiptZoomableImage,
  type ReceiptImageZoomRef,
} from "./receiptZoom/ReceiptZoomableImage";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

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
  const zoomRef = useRef<ReceiptImageZoomRef>(null);

  const viewportHeight = windowHeight - insets.top - insets.bottom;

  useEffect(() => {
    if (!visible) {
      zoomRef.current?.reset();
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    void triggerHaptic();
    zoomRef.current?.reset();
    onClose();
  }, [onClose]);

  const handleShare = useCallback(async () => {
    void triggerHaptic();
    try {
      const extension = guessReceiptExtension(url);
      if (!cacheDirectory) {
        throw new Error("Cache unavailable");
      }
      const localUri = `${cacheDirectory}receipt-share-${Date.now()}.${extension}`;
      const download = await downloadAsync(url, localUri);

      try {
        const Sharing = await import("expo-sharing");
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(download.uri, {
            mimeType: `image/${extension === "jpg" ? "jpeg" : extension}`,
            dialogTitle: "Share receipt",
          });
          return;
        }
      } catch {
        // Native ExpoSharing module may be missing until dev client rebuild.
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

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
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

          <View
            style={[
              styles.imageStage,
              { width: windowWidth, height: viewportHeight },
            ]}
          >
            <ReceiptZoomableImage
              ref={zoomRef}
              minScale={MIN_SCALE}
              maxScale={MAX_SCALE}
              doubleTapScale={DOUBLE_TAP_SCALE}
            >
              <Image
                source={{ uri: url }}
                style={styles.receiptImage}
                contentFit="contain"
                accessibilityLabel="Receipt image full size"
                placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
              />
            </ReceiptZoomableImage>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  viewerRoot: {
    flex: 1,
    backgroundColor: overlays.scrim,
    justifyContent: "center",
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
    backgroundColor: overlays.scrimHeavy,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarButtonPressed: {
    opacity: 0.88,
  },
  imageStage: {
    alignSelf: "center",
    overflow: "hidden",
  },
  receiptImage: {
    width: "100%",
    height: "100%",
  },
});
