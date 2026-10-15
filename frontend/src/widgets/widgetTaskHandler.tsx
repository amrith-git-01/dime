import type { WidgetTaskHandlerProps } from "react-native-android-widget";

import { ThisMonthWidget } from "./ThisMonthWidget";

/** Widget names must match `name` in the react-native-android-widget plugin config (app.json). */
const WIDGETS = {
  ThisMonth: ThisMonthWidget,
} as const;

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  "use no memo";
  const Widget = WIDGETS[props.widgetInfo.widgetName as keyof typeof WIDGETS];
  if (!Widget) return;

  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED":
      props.renderWidget(<Widget />);
      break;
    default:
      // WIDGET_DELETED and WIDGET_CLICK (OPEN_APP is handled natively) need no JS work yet.
      break;
  }
}
