import type { WidgetTaskHandlerProps } from "react-native-android-widget";

import {
  drainWidgetOutbox,
  runWidgetPreset,
  undoLastWidgetAction,
} from "@/lib/widgets/widgetPresetActions";
import { reportError } from "@/lib/reportError";

import { PRESET_CLICK_ACTION, UNDO_CLICK_ACTION } from "./QuickAddWidget";
import { refreshWidgets } from "./refreshWidgets";
import { renderWidget } from "./renderWidget";

/**
 * Headless task: runs when the launcher adds, updates, resizes or taps a widget. Drawing comes
 * from the stored snapshot only. The network is touched only to send a queued or tapped preset
 * (and undo one): taps on every other control open the app through deep links, natively.
 * The library kills the task after 30 s; every request below has its own, shorter, timeout.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const draw = () => {
    const widget = renderWidget(props.widgetInfo);
    if (widget) {
      props.renderWidget(widget);
    }
  };
  // The tapped widget through the task, every widget through the launcher.
  const redraw = () => {
    draw();
    refreshWidgets();
  };

  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_RESIZED":
      draw();
      break;
    case "WIDGET_UPDATE":
      // Draw first (instant, offline), then send anything still queued.
      draw();
      await drainWidgetOutbox(redraw);
      break;
    case "WIDGET_CLICK":
      try {
        if (props.clickAction === PRESET_CLICK_ACTION) {
          const index = Number(props.clickActionData?.index);
          if (Number.isInteger(index)) {
            await runWidgetPreset(index, redraw);
          }
        } else if (props.clickAction === UNDO_CLICK_ACTION) {
          await undoLastWidgetAction(redraw);
        }
      } catch (error) {
        reportError(error, "widget click failed");
      }
      draw();
      break;
    default:
      // WIDGET_DELETED. OPEN_URI / OPEN_APP taps are handled natively.
      break;
  }
}
