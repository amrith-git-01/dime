"use no memo";
// Widget JSX is built by plain calls (see ThisMonthWidget), so the React Compiler stays off here.

import type { WidgetInfo, WidgetRepresentation } from "react-native-android-widget";

import { getHideWidgetAmounts } from "@/lib/widgets/widgetPreferences";
import {
  readWidgetLastAction,
  readWidgetOutbox,
  readWidgetPresets,
} from "@/lib/widgets/widgetPresetsMmkv";
import { readWidgetSnapshot } from "@/lib/widgets/widgetSnapshotMmkv";

import { CategoryBudgetsWidget } from "./CategoryBudgetsWidget";
import { buildCategoryBudgetsModel } from "./categoryBudgetsModel";
import { QuickAddWidget } from "./QuickAddWidget";
import { buildQuickAddModel } from "./quickAddModel";
import { ThisMonthWidget } from "./ThisMonthWidget";
import {
  buildThisMonthModel,
  thisMonthLayout,
  thisMonthShowsSplit,
} from "./thisMonthModel";
import { TodayWidget } from "./TodayWidget";
import { buildTodayModel } from "./todayModel";
import { UpcomingWidget } from "./UpcomingWidget";
import { buildUpcomingModel } from "./upcomingModel";
import { isWidgetName, type WidgetName } from "./widgetNames";
import { renderThemed } from "./widgetTheme";

/** The last preset action, only when it belongs to the signed-in account. */
function lastActionOf(userId: string | undefined) {
  const action = readWidgetLastAction();
  return action && action.userId === userId ? action : null;
}

/**
 * The one place a widget is drawn, from the snapshot alone (no network, no session). Shared by the
 * launcher's headless task and the app's own refresh after a snapshot write.
 */
export function renderKnownWidget(
  name: WidgetName,
  heightDp: number,
): WidgetRepresentation {
  const snapshot = readWidgetSnapshot();
  const hideAmounts = getHideWidgetAmounts();
  const now = new Date();

  switch (name) {
    case "ThisMonth": {
      const model = buildThisMonthModel(snapshot, now, hideAmounts);
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
    case "QuickAdd": {
      const model = buildQuickAddModel({
        signedOut: snapshot === null,
        presets: readWidgetPresets(snapshot?.userId),
        lastAction: lastActionOf(snapshot?.userId),
        outboxCount: readWidgetOutbox().length,
        heightDp,
        now: now.getTime(),
        hideAmounts,
      });
      return renderThemed((colors) => <QuickAddWidget colors={colors} model={model} />);
    }
    case "Today": {
      const model = buildTodayModel(snapshot, now, hideAmounts);
      return renderThemed((colors) => <TodayWidget model={model} colors={colors} />);
    }
    case "Upcoming": {
      const model = buildUpcomingModel(snapshot, now, hideAmounts);
      return renderThemed((colors) => <UpcomingWidget model={model} colors={colors} />);
    }
    case "CategoryBudgets": {
      const model = buildCategoryBudgetsModel(snapshot, now, hideAmounts);
      return renderThemed((colors) => (
        <CategoryBudgetsWidget model={model} colors={colors} />
      ));
    }
  }
}

/** Null for a widget name this build does not know. */
export function renderWidget(info: WidgetInfo): WidgetRepresentation | null {
  return isWidgetName(info.widgetName)
    ? renderKnownWidget(info.widgetName, info.height)
    : null;
}
