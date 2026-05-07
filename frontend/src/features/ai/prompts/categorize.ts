const CATEGORY_LINES = [
  "🍔 Food & Dining",
  "🚗 Transport",
  "🛍️ Shopping",
  "💊 Health",
  "🎬 Entertainment",
  "💡 Utilities",
  "✈️ Travel",
  "📚 Education",
  "💰 Income/Credit",
  "📦 Others",
] as const;

function escapeForPrompt(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildCategorizePrompt(
  merchant: string,
  amount: string,
): string {
  const safeMerchant = escapeForPrompt(merchant.trim());
  const safeAmount = escapeForPrompt(amount.trim());

  return [
    "Categorize this expense.",
    `Merchant: "${safeMerchant}"`,
    `Amount: ₹${safeAmount}`,
    "",
    "Categories (pick exactly one). Respond with ONLY that line: emoji + space + name. No quotes, no punctuation after, no explanation.",
    ...CATEGORY_LINES.map((line) => `- ${line}`),
  ].join("\n");
}
