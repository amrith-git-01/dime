/** Must match `name` in the react-native-android-widget plugin config (app.json). */
export const WIDGET_NAMES = ["ThisMonth", "QuickAdd", "Today", "Upcoming", "CategoryBudgets"] as const;

export type WidgetName = (typeof WIDGET_NAMES)[number];

export function isWidgetName(value: string): value is WidgetName {
  return (WIDGET_NAMES as readonly string[]).includes(value);
}
