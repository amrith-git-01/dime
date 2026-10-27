import { ImageFormat, makeImageFromView } from "@shopify/react-native-skia";
import { cacheDirectory, writeAsStringAsync } from "expo-file-system/legacy";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import type { RefObject } from "react";
import { Share, type View } from "react-native";

export type ShareReportResult =
  /** The share sheet was opened (what the user did in it is not known). */
  | "shared"
  /** The card could not be captured as an image (the view was not ready). */
  | "capture_failed"
  /** The image could not be written or the share sheet could not be opened. */
  | "failed";

/**
 * Captures the share card, writes it to the cache and opens the share sheet. Never throws: a view
 * that is not ready (`makeImageFromView` returns null) or a native failure comes back as a result
 * the caller turns into a toast. JS only: no new native module.
 */
export async function shareReportCard(input: {
  cardRef: RefObject<View | null>;
  periodKey: string;
  /** The message sent along with the image (and the whole share when there is no sheet for images). */
  message: string;
}): Promise<ShareReportResult> {
  const { cardRef, periodKey, message } = input;

  let uri: string | null = null;
  try {
    const image = await makeImageFromView(cardRef);
    if (!image) {
      return "capture_failed";
    }
    const base64 = image.encodeToBase64(ImageFormat.PNG, 100);
    if (!base64 || !cacheDirectory) {
      return "capture_failed";
    }
    uri = `${cacheDirectory}broke-report-${periodKey}-${Date.now()}.png`;
    await writeAsStringAsync(uri, base64, { encoding: "base64" });
  } catch {
    return "capture_failed";
  }

  if (!uri) {
    return "capture_failed";
  }
  const fileUri = uri;

  // No share sheet for files on this device: the system share (text and link) is the fallback.
  let canShareFile = false;
  try {
    canShareFile = await isAvailableAsync();
  } catch {
    canShareFile = false;
  }

  try {
    if (canShareFile) {
      await shareAsync(fileUri, {
        mimeType: "image/png",
        dialogTitle: "Share your Broke Report",
      });
    } else {
      await Share.share({ message, url: fileUri });
    }
    return "shared";
  } catch {
    return "failed";
  }
  // The file stays in the cache: the share target reads it after the sheet has opened, and the OS
  // clears the cache on its own.
}
