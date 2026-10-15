import type { WidgetTaskHandlerProps } from "react-native-android-widget";

import { renderWidget } from "./renderWidget";

/**
 * Headless task: runs when the launcher adds, updates or resizes a widget. Draws from the stored
 * snapshot only; it never calls the API or touches the session (taps open the app via deep links).
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED": {
      const widget = renderWidget(props.widgetInfo);
      if (widget) {
        props.renderWidget(widget);
      }
      break;
    }
    default:
      // WIDGET_DELETED, and WIDGET_CLICK (OPEN_URI / OPEN_APP are handled natively).
      break;
  }
}
