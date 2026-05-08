import {
  type Action,
  manipulateAsync,
  SaveFormat,
} from "expo-image-manipulator";
import { Image } from "react-native";

/** Keeps upload payload predictable; full-res phone photos are unnecessarily huge. */
const MAX_EDGE_PX = 1280;

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
  try {
    const size = await getImageSize(uri);
    let actions: Action[] = [];

    if (size) {
      const longEdge = Math.max(size.width, size.height);
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

    if (!mustReencode) {
      return uri;
    }

    const result = await manipulateAsync(uri, actions, {
      compress: 0.82,
      format: SaveFormat.JPEG,
    });

    return result.uri;
  } catch {
    return null;
  }
}
