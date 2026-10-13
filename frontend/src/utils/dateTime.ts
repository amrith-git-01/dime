import { format, isValid, parse, parseISO } from "date-fns";

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

/**
 * Initial date-time of a new transaction. No preset, today (or a future day) -> now; a past
 * `yyyy-MM-dd` day -> that day at 12:00 local, so no time zone can move it to a neighbouring day.
 */
export function resolvePresetTransactionAt(
  presetDate?: string,
  now: Date = new Date(),
): Date {
  if (!presetDate || presetDate >= format(now, "yyyy-MM-dd")) {
    return now;
  }
  const day = parse(presetDate, "yyyy-MM-dd", now);
  if (!isValid(day)) {
    return now;
  }
  day.setHours(12, 0, 0, 0);
  return day;
}

/** Clock time for notification rows (date lives on the section header). */
export function formatNotificationTime(iso: string): string {
  return format(parseISO(iso), "h:mm a");
}
