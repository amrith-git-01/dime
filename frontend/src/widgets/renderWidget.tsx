"use no memo";
// Widget JSX is built by plain calls (see DimeWidget), so the React Compiler stays off here.

import type { WidgetInfo, WidgetRepresentation } from "react-native-android-widget";

import { getWidgetCardToken } from "@/lib/widgets/widgetCardToken";
import { getHideWidgetAmounts } from "@/lib/widgets/widgetPreferences";
import { readWidgetSnapshot } from "@/lib/widgets/widgetSnapshotMmkv";

import { DimeWidget } from "./DimeWidget";
import {
  buildDimeWidgetModel,
  dimeWidgetLayout,
  dimeWidgetShowsCategories,
} from "./dimeWidgetModel";
import { isWidgetName, type WidgetName } from "./widgetNames";
import { renderThemed } from "./widgetTheme";

/** The widget's current size in dp (0 when the launcher has not reported one). */
export type WidgetSizeDp = { widthDp: number; heightDp: number };

/**
 * The one place a widget is drawn, from the snapshot and the capture status alone (no network, no
 * session). Shared by the launcher's headless task and the app's own refresh after a snapshot write.
 */
export function renderKnownWidget(
  _name: WidgetName,
  { widthDp, heightDp }: WidgetSizeDp,
): WidgetRepresentation {
  const model = buildDimeWidgetModel(
    readWidgetSnapshot(),
    new Date(),
    getHideWidgetAmounts(),
  );
  const layout = dimeWidgetLayout(heightDp);
  const showCategories = dimeWidgetShowsCategories(widthDp);
  const cardToken = getWidgetCardToken();
  return renderThemed((colors) => (
    <DimeWidget
      model={model}
      colors={colors}
      layout={layout}
      showCategories={showCategories}
      cardToken={cardToken}
    />
  ));
}

/** Null for a widget name this build does not know. */
export function renderWidget(info: WidgetInfo): WidgetRepresentation | null {
  return isWidgetName(info.widgetName)
    ? renderKnownWidget(info.widgetName, { widthDp: info.width, heightDp: info.height })
    : null;
}
