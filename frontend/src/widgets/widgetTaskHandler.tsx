import type { WidgetTaskHandlerProps } from "react-native-android-widget";

import { settlePendingCaptures } from "@/features/widgetActions/utils/settleCapture";
import { getSession } from "@/lib/auth/session";
import { reportError } from "@/lib/reportError";

import { renderWidget } from "./renderWidget";

/** The launcher kills this task after 30 s; settling a capture gets a fraction of that. */
const SETTLE_BUDGET_MS = 5_000;

/**
 * Headless task: runs when the launcher adds, updates or resizes the widget. Drawing comes from the
 * stored snapshot and capture status only. The network is touched once, on the periodic update, to
 * settle a capture the card left unfinished ("Reading receipt…"). Taps on every button open the card
 * or the app through links, natively.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const draw = () => {
    const widget = renderWidget(props.widgetInfo);
    if (widget) {
      props.renderWidget(widget);
    }
  };

  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_RESIZED":
      draw();
      break;
    case "WIDGET_UPDATE":
      // Draw first (instant, offline), then ask once about captures still being read and draw again.
      draw();
      try {
        await settlePendingCaptures(getSession()?.user.id, SETTLE_BUDGET_MS);
      } catch (error) {
        reportError(error, "widget capture settle failed");
      }
      draw();
      break;
    default:
      // WIDGET_DELETED. OPEN_URI taps are handled natively.
      break;
  }
}
