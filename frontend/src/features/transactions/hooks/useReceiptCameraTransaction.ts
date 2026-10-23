import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { useCallback } from "react";
import { Alert, InteractionManager } from "react-native";

import { confirmCapturePermissionReason } from "@/features/onboarding/utils/permissionReasonAlert";
import { invalidateLimitsQueries } from "@/features/limits/cache/invalidateLimitsQueries";
import { invalidateOnboardingProgress } from "@/features/onboarding/cache/invalidateOnboardingProgress";
import { useToast } from "@/features/toast/useToast";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { enqueueCapture } from "@/lib/outbox/outboxQueue";
import { sendOrQueue } from "@/lib/outbox/sendOrQueue";
import { useReceiptScanUiStore } from "@/stores/receiptScanUiStore";

import { submitReceipt } from "../api/submitTransactionApi";
import { prepareReceiptImageForUpload } from "../receipt/prepareReceiptImageForUpload";

/** Opens camera and queues receipt processing on backend. */
export function useReceiptCameraTransaction() {
  const { userId } = useSessionUserId();
  const showBusy = useReceiptScanUiStore((s) => s.show);
  const hideBusy = useReceiptScanUiStore((s) => s.hide);
  const { showToast } = useToast();
  const qc = useQueryClient();

  return useCallback(async () => {
    if (!userId) {
      Alert.alert(
        "Sign in required",
        "Sign in to add a transaction from a photo.",
      );
      return;
    }

    // First time only: say why before the system dialog.
    if (!(await confirmCapturePermissionReason("camera"))) {
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

    // One key per captured photo, so a retried upload of this capture cannot create a second transaction.
    const idempotencyKey = randomUUID();
    const capturedAt = new Date().toISOString();

    await new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => resolve());
    });
    await new Promise((r) => setTimeout(r, 400));

    showBusy("Preparing photo...");

    try {
      const preparedUri = await prepareReceiptImageForUpload(uri);
      if (!preparedUri) {
        Alert.alert(
          "Could not use this photo",
          "Try capturing again. If this keeps happening, add the transaction manually.",
        );
        return;
      }

      showBusy("Uploading receipt...");
      const outcome = await sendOrQueue({
        isOnline: () => onlineManager.isOnline(),
        // No `capturedAt` on a live upload: the server stamps it with the request time, which is the
        // same moment (and cannot trip its clock-skew check on a device with a wrong clock).
        send: () =>
          submitReceipt({
            fileUri: preparedUri,
            fileName: "receipt.jpg",
            mimeType: "image/jpeg",
            idempotencyKey,
          }),
        queue: async () => {
          await enqueueCapture({
            userId,
            kind: "receipt",
            sourceUri: preparedUri,
            fileName: "receipt.jpg",
            mimeType: "image/jpeg",
            idempotencyKey,
            capturedAt,
          });
        },
      });
      if (outcome.status === "queued") {
        showToast({
          variant: "info",
          message: "Saved. It will be read when you're back online.",
        });
      } else {
        showToast({
          variant: "success",
          message: "Receipt added for processing",
        });
        // The row itself arrives through realtime once it is processed.
        invalidateOnboardingProgress(qc);
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not save the transaction.";
      showToast({
        variant: "error",
        message: "Could not upload receipt",
      });
      Alert.alert("Something went wrong", message);
    } finally {
      hideBusy();
      invalidateLimitsQueries(qc);
    }
  }, [hideBusy, qc, showBusy, showToast, userId]);
}
