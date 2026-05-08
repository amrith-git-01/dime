import {
  type Action,
  manipulateAsync,
  SaveFormat,
} from "expo-image-manipulator";
import { Image } from "react-native";

/** Keeps upload payload predictable; full-res phone photos are unnecessarily huge. */
const MAX_EDGE_PX = 1280;

function logPrepare(step: string, extra?: Record<string, unknown>) {
  const payload = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[receipt-image] ${step}${payload}`);
}

function getImageSize(
  uri: string,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(null),
    );
  });
}

/** Downscales and re-encodes camera captures into a stable upload URI. */
export async function prepareReceiptImageForUpload(
  uri: string,
): Promise<string | null> {
  logPrepare("start", { uri });
  try {
    const size = await getImageSize(uri);
    logPrepare("size", size ?? { width: null, height: null });
    let actions: Action[] = [];

    if (size) {
      const longEdge = Math.max(size.width, size.height);
      logPrepare("long-edge", { longEdge });
      if (longEdge > MAX_EDGE_PX) {
        actions =
          size.width >= size.height
            ? [{ resize: { width: MAX_EDGE_PX } }]
            : [{ resize: { height: MAX_EDGE_PX } }];
      }
    } else {
      actions = [{ resize: { width: MAX_EDGE_PX } }];
    }

    const mustReencode = uri.startsWith("content://") || actions.length > 0;
    logPrepare("reencode-check", {
      mustReencode,
      actionsCount: actions.length,
      startsWithContent: uri.startsWith("content://"),
    });

    if (!mustReencode) {
      logPrepare("reuse-direct-uri", { uri });
      return uri;
    }

    const result = await manipulateAsync(uri, actions, {
      compress: 0.82,
      format: SaveFormat.JPEG,
    });
    logPrepare("manipulate-done", {
      resultUri: result.uri,
      width: result.width,
      height: result.height,
    });

    logPrepare("prepared-uri", { uri: result.uri });
    return result.uri;
  } catch (error) {
    logPrepare("error", {
      message: error instanceof Error ? error.message : "unknown",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return null;
  }
}
