import { useSessionUserId } from "@/hooks/useSessionUserId";
import { useReceiptScanUiStore } from "@/stores/receiptScanUiStore";
import * as ImagePicker from "expo-image-picker";
import { useCallback } from "react";
import { Alert, InteractionManager } from "react-native";

import { prepareReceiptImageForUpload } from "@/features/transactions/receipt/prepareReceiptImageForUpload";
import { submitReceipt } from "../api/submitTransactionApi";

/** Opens camera and queues receipt processing on backend. */
export function useReceiptCameraTransaction() {
  const { userId, authReady } = useSessionUserId();
  const showBusy = useReceiptScanUiStore((s) => s.show);
  const hideBusy = useReceiptScanUiStore((s) => s.hide);

  return useCallback(async () => {
    if (!authReady || !userId) {
      Alert.alert(
        "Sign in required",
        "Sign in to add a transaction from a photo.",
      );
      return;
    }

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Camera access needed",
        "Allow camera access to capture a receipt photo.",
      );
      return;
    }

    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.72,
      allowsEditing: false,
    });

    if (picked.canceled) {
      return;
    }

    const uri = picked.assets?.[0]?.uri;
    if (!uri) {
      Alert.alert(
        "No photo",
        "Capture was cancelled or no image was returned.",
      );
      return;
    }

    await new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => resolve());
    });
    await new Promise((r) => setTimeout(r, 400));

    showBusy("Preparing photo…");

    try {
      const preparedUri = await prepareReceiptImageForUpload(uri);
      if (!preparedUri) {
        Alert.alert(
          "Could not use this photo",
          "Try capturing again. If this keeps happening, add the transaction manually.",
        );
        return;
      }

      showBusy("Uploading receipt…");
      await submitReceipt({
        fileUri: preparedUri,
        fileName: "receipt.jpg",
        mimeType: "image/jpeg",
      });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not save the transaction.";
      Alert.alert("Something went wrong", message);
    } finally {
      hideBusy();
    }
  }, [authReady, hideBusy, showBusy, userId]);
}
