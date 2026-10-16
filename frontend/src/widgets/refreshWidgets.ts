import { Platform } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";

import { reportError } from "@/lib/reportError";

import { renderKnownWidget } from "./renderWidget";
import { WIDGET_NAMES } from "./widgetNames";

/**
 * Redraws the widget on the home screen from the current snapshot. Fire and forget: Android
 * only, and a failure (no widget added, launcher busy) is reported but never thrown.
 */
export function refreshWidgets(): void {
  if (Platform.OS !== "android") {
    return;
  }
  for (const widgetName of WIDGET_NAMES) {
    requestWidgetUpdate({
      widgetName,
      renderWidget: (info) =>
        renderKnownWidget(widgetName, { widthDp: info.width, heightDp: info.height }),
    }).catch((error) => reportError(error, `refreshWidgets failed: ${widgetName}`));
  }
}
