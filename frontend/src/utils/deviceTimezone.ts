/** IANA timezone for calendar boundaries (e.g. Asia/Kolkata). */
export function getDeviceIanaTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.length > 0 ? tz : "UTC";
  } catch {
    return "UTC";
  }
}
