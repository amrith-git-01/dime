import { format, isToday, isYesterday, parseISO } from "date-fns";

/** Compact time label for notification rows. */
export function formatNotificationTime(iso: string): string {
  const date = parseISO(iso);
  if (isToday(date)) {
    return format(date, "h:mm a");
  }
  if (isYesterday(date)) {
    return `Yesterday · ${format(date, "h:mm a")}`;
  }
  return format(date, "d MMM · h:mm a");
}
