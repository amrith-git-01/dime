"use no memo";
// Widget JSX is built by plain calls (see ThisMonthWidget), so the React Compiler stays off here.

import type { WidgetInfo, WidgetRepresentation } from "react-native-android-widget";

import { readWidgetSnapshot } from "@/lib/widgets/widgetSnapshotMmkv";

import { QuickAddWidget } from "./QuickAddWidget";
import { ThisMonthWidget } from "./ThisMonthWidget";
import {
  buildThisMonthModel,
  thisMonthLayout,
  thisMonthShowsSplit,
} from "./thisMonthModel";
import { isWidgetName, type WidgetName } from "./widgetNames";
import { renderThemed } from "./widgetTheme";

/**
 * The one place a widget is drawn, from the snapshot alone (no network, no session). Shared by the
 * launcher's headless task and the app's own refresh after a snapshot write.
 */
export function renderKnownWidget(
  name: WidgetName,
  heightDp: number,
): WidgetRepresentation {
  switch (name) {
    case "ThisMonth": {
      const model = buildThisMonthModel(readWidgetSnapshot());
      const layout = thisMonthLayout(heightDp);
      const showSplit = thisMonthShowsSplit(heightDp);
      return renderThemed((colors) => (
        <ThisMonthWidget
          model={model}
          colors={colors}
          layout={layout}
          showSplit={showSplit}
        />
      ));
    }
    case "QuickAdd":
      return renderThemed((colors) => <QuickAddWidget colors={colors} />);
  }
}

/** Null for a widget name this build does not know. */
export function renderWidget(info: WidgetInfo): WidgetRepresentation | null {
  return isWidgetName(info.widgetName)
    ? renderKnownWidget(info.widgetName, info.height)
    : null;
}
