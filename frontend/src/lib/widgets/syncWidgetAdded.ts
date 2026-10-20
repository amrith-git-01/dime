import { Platform } from "react-native";
import { getWidgetInfo } from "react-native-android-widget";

import { WIDGET_NAMES } from "@/widgets/widgetNames";

import { setWidgetAdded } from "./widgetPreferences";

/**
 * Remembers a widget that was added before the "added" flag existed (or while the headless task could
 * not write it): asks the launcher which Dime widgets are on the home screen. Android only; a failure
 * (launcher busy, no widgets) just leaves the flag as it was. Returns whether a widget is on screen.
 */
export async function syncWidgetAdded(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return false;
  }
  try {
    const lists = await Promise.all(WIDGET_NAMES.map((name) => getWidgetInfo(name)));
    const added = lists.some((list) => list.length > 0);
    if (added) {
      setWidgetAdded();
    }
    return added;
  } catch {
    return false;
  }
}
