export function notificationResponseStamp(
  identifier: string,
  date: number,
): string {
  return `${identifier}:${date}`;
}

export function isUnhandledNotificationResponseStamp(
  stamp: string,
  lastHandledStamp: string | null,
): boolean {
  return lastHandledStamp !== stamp;
}
