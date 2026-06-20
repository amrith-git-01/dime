import { format, isToday, isYesterday, parseISO } from "date-fns";

/** Keep calendar day from `datePart` and clock from `timePart`. */
export function mergeDateWithTime(datePart: Date, timePart: Date): Date {
  const merged = new Date(datePart);
  merged.setHours(
    timePart.getHours(),
    timePart.getMinutes(),
    timePart.getSeconds(),
    timePart.getMilliseconds(),
  );
  return merged;
}

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
