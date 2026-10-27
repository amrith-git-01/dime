import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";

/** Full-screen over the tabs, like TransactionDetail: no header, fade, the screen paints itself. */
export const brokeReportScreenOptions: NativeStackNavigationOptions = {
  headerShown: false,
  presentation: "transparentModal",
  animation: "fade",
  contentStyle: { backgroundColor: "transparent" },
};

/**
 * One screen per report. Opening another month while one is on screen (a link, a push tap) mounts
 * a new screen with a fresh story, instead of changing the params of the old one.
 */
export function getBrokeReportScreenId({
  params,
}: {
  params: { periodKey: string };
}): string {
  return params.periodKey;
}
