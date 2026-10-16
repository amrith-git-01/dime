import { randomUUID } from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";

import { submitReceipt } from "@/features/transactions/api/submitTransactionApi";
import { prepareReceiptImageForUpload } from "@/features/transactions/receipt/prepareReceiptImageForUpload";

import { markCaptureFailed } from "../utils/settleCapture";
import { closeCard, useCloseAfterCapture } from "./useCardClose";
import { runCapture, type CapturePhase } from "../utils/runCapture";

export type PickSource = "camera" | "library";

/** `launching` is the camera or the photo picker on screen (or about to be): the card shows nothing. */
export type PickedCaptureState = {
  phase: CapturePhase | "launching";
  text: string;
};

const CAMERA_DENIED_TEXT = "Allow camera access to scan a receipt";
const UNUSABLE_PHOTO_TEXT = "Couldn't use that photo. Try another one";

/** Same options as the app's own scan flow (`useReceiptCameraTransaction`). */
const PICK_OPTIONS = {
  mediaTypes: ["images"],
  quality: 0.72,
  allowsEditing: false,
} satisfies ImagePicker.ImagePickerOptions;

/**
 * Scan / Gallery: opens the camera or the system photo picker straight away, then sends the photo and
 * waits for the server to read it. Cancelling the picker closes the card. The photo is kept for
 * "Try again". The Idempotency-Key is kept when the upload itself failed (a retry cannot add the
 * receipt twice), and replaced once the server accepted it and the job failed: that key now belongs
 * to the failed job, which the server would replay forever.
 *
 * `enabled` is false until the user has confirmed a launch that did not come from our own widget.
 */
export function usePickedCapture(source: PickSource, userId: string, enabled: boolean) {
  const [state, setState] = useState<PickedCaptureState>({ phase: "launching", text: "" });
  const cancelledRef = useRef(false);
  const idempotencyKeyRef = useRef(randomUUID());
  const preparedUriRef = useRef<string | null>(null);

  const upload = useCallback(
    async (fileUri: string) => {
      const result = await runCapture({
        userId,
        kind: "receipt",
        submit: () =>
          submitReceipt({
            fileUri,
            fileName: "receipt.jpg",
            mimeType: "image/jpeg",
            idempotencyKey: idempotencyKeyRef.current,
          }),
        onPhase: (phase, text) => {
          if (!cancelledRef.current) {
            setState({ phase, text });
          }
        },
        isCancelled: () => cancelledRef.current,
      });
      if (result.failure === "job") {
        idempotencyKeyRef.current = randomUUID();
      }
    },
    [userId],
  );

  const fail = useCallback(
    (text: string) => {
      markCaptureFailed({ userId, text });
      setState({ phase: "failed", text });
    },
    [userId],
  );

  const start = useCallback(async () => {
    setState({ phase: "launching", text: "" });
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (cancelledRef.current) {
          return;
        }
        if (!permission.granted) {
          fail(CAMERA_DENIED_TEXT);
          return;
        }
      }
      const picked =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(PICK_OPTIONS)
          : await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
      if (cancelledRef.current) {
        return;
      }
      const uri = picked.canceled ? undefined : picked.assets?.[0]?.uri;
      if (!uri) {
        closeCard();
        return;
      }
      setState({ phase: "uploading", text: "Preparing photo…" });
      const prepared = await prepareReceiptImageForUpload(uri);
      if (cancelledRef.current) {
        return;
      }
      if (!prepared) {
        fail(UNUSABLE_PHOTO_TEXT);
        return;
      }
      preparedUriRef.current = prepared;
      await upload(prepared);
    } catch {
      if (!cancelledRef.current) {
        fail(UNUSABLE_PHOTO_TEXT);
      }
    }
  }, [fail, source, upload]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    cancelledRef.current = false;
    void start();
    return () => {
      cancelledRef.current = true;
    };
  }, [enabled, start]);

  const retry = useCallback(() => {
    const uri = preparedUriRef.current;
    if (uri) {
      void upload(uri);
    } else {
      void start();
    }
  }, [start, upload]);

  useCloseAfterCapture(state.phase === "launching" ? null : state.phase);

  return { ...state, retry };
}
