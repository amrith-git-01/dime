const REMINDER_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function parseReminderTime(
  time: string,
): { hour: number; minute: number } | null {
  if (!REMINDER_TIME_PATTERN.test(time)) {
    return null;
  }

  const [hourPart, minutePart] = time.split(":");
  const hour = Number(hourPart);
  const minute = Number(minutePart);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }

  return { hour, minute };
}
