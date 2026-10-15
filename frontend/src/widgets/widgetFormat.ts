/** What every widget shows in place of an amount when "Hide amounts on widgets" is on. */
export const HIDDEN_AMOUNT = "₹ ••••";

/** `text` as is, or the hidden placeholder. */
export function maskAmount(text: string, hideAmounts: boolean): string {
  return hideAmounts ? HIDDEN_AMOUNT : text;
}

/** A `#rrggbb` colour from API data that is safe to hand to the widget runtime, else null. */
export function safeHexColor(value: string | null | undefined): string | null {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}
