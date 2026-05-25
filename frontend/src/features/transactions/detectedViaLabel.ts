/** Short label for transaction row subtitle (matches API detected_via). */
export function detectedViaLabel(
  detectedVia: string | null | undefined,
): string {
  switch (detectedVia) {
    case "manual":
      return "Manual";
    case "sms":
      return "SMS";
    case "voice":
      return "Voice";
    case "scan":
      return "Scan";
    case "notification":
      return "UPI";
    default:
      return "Other";
  }
}
