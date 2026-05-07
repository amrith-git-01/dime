/**
 * Text half of multimodal receipt scan — pair with `useGemma().promptWithImage`
 * using the captured photo path / `file://` URI.
 */
export function buildReceiptScanPrompt(): string {
  return [
    "Look at this receipt image and extract the printed details.",
    "Return ONLY one JSON object with keys:",
    '"merchant" (string), "amount" (number), "date" (string), "items" (array of objects with "name" (string) and optional "amount" (number)).',
    "Prefer the receipt total for amount when visible. Use valid JSON. No markdown, no code fences, no commentary.",
  ].join("\n");
}
