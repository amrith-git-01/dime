import { useSessionUserId } from "@/hooks/useSessionUserId";
import { useReceiptScanUiStore } from "@/stores/receiptScanUiStore";
import * as ImagePicker from "expo-image-picker";
import { useCallback } from "react";
import { Alert, InteractionManager } from "react-native";

import { prepareReceiptImageForUpload } from "@/features/transactions/receipt/prepareReceiptImageForUpload";
import { submitReceipt } from "../api/submitTransactionApi";

function logReceiptScan(step: string, extra?: Record<string, unknown>) {
  const payload = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[receipt-scan] ${step}${payload}`);
}

/** Opens camera and queues receipt processing on backend. */
export function useReceiptCameraTransaction() {
  const { userId, authReady } = useSessionUserId();
  const showBusy = useReceiptScanUiStore((s) => s.show);
  const hideBusy = useReceiptScanUiStore((s) => s.hide);

  return useCallback(async () => {
    const startedAt = Date.now();
    logReceiptScan("start", { authReady, hasUser: Boolean(userId) });

    if (!authReady || !userId) {
      logReceiptScan("blocked-auth");
      Alert.alert(
        "Sign in required",
        "Sign in to add a transaction from a photo.",
      );
      return;
    }

    logReceiptScan("request-camera-permission");
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    logReceiptScan("camera-permission-result", {
      granted: perm.granted,
      canAskAgain: perm.canAskAgain,
      status: perm.status,
    });
    if (!perm.granted) {
      Alert.alert(
        "Camera access needed",
        "Allow camera access to capture a receipt photo.",
      );
      return;
    }

    logReceiptScan("launch-camera");
    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.72,
      allowsEditing: false,
    });
    logReceiptScan("camera-returned", {
      canceled: picked.canceled,
      assets: picked.assets?.length ?? 0,
      elapsedMs: Date.now() - startedAt,
    });

    if (picked.canceled) {
      logReceiptScan("cancelled-by-user");
      return;
    }

    const uri = picked.assets?.[0]?.uri;
    if (!uri) {
      logReceiptScan("missing-uri");
      Alert.alert(
        "No photo",
        "Capture was cancelled or no image was returned.",
      );
      return;
    }
    logReceiptScan("picked-uri", { uri });

    await new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => resolve());
    });
    await new Promise((r) => setTimeout(r, 400));
    logReceiptScan("post-camera-settled");

    showBusy("Preparing photo…");

    try {
      logReceiptScan("prepare-image-start");
      const preparedUri = await prepareReceiptImageForUpload(uri);
      logReceiptScan("prepare-image-done", { preparedUri });
      if (!preparedUri) {
        Alert.alert(
          "Could not use this photo",
          "Try capturing again. If this keeps happening, add the transaction manually.",
        );
        return;
      }

      showBusy("Uploading receipt…");
      logReceiptScan("upload-start");
      await submitReceipt({
        fileUri: preparedUri,
        fileName: "receipt.jpg",
        mimeType: "image/jpeg",
      });
      logReceiptScan("queued-success", {
        elapsedMs: Date.now() - startedAt,
      });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not save the transaction.";
      logReceiptScan("error", {
        message,
        stack: e instanceof Error ? e.stack : undefined,
      });
      Alert.alert("Something went wrong", message);
    } finally {
      hideBusy();
      logReceiptScan("end", { elapsedMs: Date.now() - startedAt });
    }
  }, [authReady, hideBusy, showBusy, userId]);
}
