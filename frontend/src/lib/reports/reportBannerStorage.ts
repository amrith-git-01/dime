import { createMMKV } from "react-native-mmkv";

/** Device flags of the Broke Report: the Home banner's dismissal, one key per user and month. */
const reportsMmkv = createMMKV({ id: "dime-reports" });

const dismissedKey = (userId: string, periodKey: string) =>
  `report_banner_dismissed.v1:${userId}:${periodKey}`;

export function isReportBannerDismissed(
  userId: string,
  periodKey: string,
): boolean {
  return reportsMmkv.getString(dismissedKey(userId, periodKey)) !== undefined;
}

/** Forgets every dismissal (sign-out and user switch: the flags belong to the previous account). */
export function clearReportBannerFlags(): void {
  reportsMmkv.clearAll();
}

/** Hides the Home banner for that month (ISO timestamp of the dismissal). */
export function dismissReportBanner(userId: string, periodKey: string): void {
  reportsMmkv.set(dismissedKey(userId, periodKey), new Date().toISOString());
}
