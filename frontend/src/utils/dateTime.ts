import { format, parseISO } from "date-fns";

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

/** Clock time for notification rows (date lives on the section header). */
export function formatNotificationTime(iso: string): string {
  return format(parseISO(iso), "h:mm a");
}
