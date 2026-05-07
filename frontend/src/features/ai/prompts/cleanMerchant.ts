export function buildCleanMerchantPrompt(rawSmsText: string): string {
  const body = rawSmsText.trim();
  return [
    "Extract the clean merchant or payee name from this bank SMS or UPI message.",
    "Respond with ONLY the name (title case if obvious). No quotes, no bank codes, no city, no explanation.",
    "",
    "Text:",
    body.length > 0 ? body : "(empty)",
  ].join("\n");
}
