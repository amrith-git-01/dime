/**
 * Parse prompts (ports of backend `features/ai/prompts/transaction_parse_prompts.py` and
 * `preprocess/prompts.py`). Wording is kept identical so model behaviour matches the Python backend.
 */
export type ParseMode = 'receipt' | 'voice';

const SCHEMA =
  '{"counterparty_name":string,' +
  '"counterparty_type":"merchant"|"person"|"self_transfer"|"unknown",' +
  '"amount":number,' +
  '"currency":"INR"|<ISO 4217 code>,' +
  '"type":"debit"|"credit",' +
  '"kind":"spend"|"income"|"transfer"|"payback",' +
  '"transfer_reason":"cash_withdrawal"|"card_bill"|"own_account"|null,' +
  '"date":"YYYY-MM-DD"|null,' +
  '"category":string,' +
  '"note":string|null,' +
  '"confidence":0-1,' +
  '"raw_model":string}';

const DATE_RULES =
  '- Date formats accepted: YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DD Mon YYYY (e.g. 23-Feb-2025), ' +
  'Mon DD YYYY, YYYY/MM/DD. Always output YYYY-MM-DD. If ambiguous or unreadable → null.\n';

/** The capture's calendar date (`YYYY-MM-DD`) and weekday name in the user's timezone. */
export interface DateReference {
  date: string;
  weekday: string;
}

/** Relative dates resolve against the capture day, not the day the (possibly queued) job happens to run. */
function referenceRules(reference: DateReference | undefined): string {
  if (!reference) return '';
  return (
    `- Reference date (the day this was captured): ${reference.date} (${reference.weekday}). ` +
    "Resolve relative dates ('today', 'yesterday', 'last Monday') against it. " +
    'Never return a date after the reference date.\n'
  );
}

/** The amount is read in the currency it is printed or spoken in; the app tracks rupees only and never converts. */
const CURRENCY_RULES =
  '- currency: the 3-letter ISO 4217 code of the amount as printed or spoken (₹, Rs and rupees are INR; $ is USD; € is EUR). ' +
  'Use INR when no currency is shown. NEVER convert: amount is the number in that currency.\n';

const TYPE_RULES =
  '- type=debit: money LEFT your account (purchase, withdrawal, payment, transfer out).\n' +
  '- type=credit: money ARRIVED in your account (refund, salary, incoming transfer).\n' +
  "- CRITICAL: 'paid by credit card' / 'credit card payment' = debit (you spent money). " +
  "'credit card' is the payment method, NOT the direction.\n" +
  "- CRITICAL: 'debited' = debit. 'credited' = credit.\n";

/** How a row counts. A transfer is neither spending nor income (it just moves money), a payback gives money back for a spend. */
const KIND_RULES =
  '- kind=spend: money spent on something (purchase, bill, fee, a payment to a merchant or person). Always a debit.\n' +
  '- kind=income: money earned or received for yourself (salary, interest, a gift, a sale). Always a credit.\n' +
  '- kind=transfer: money moved between your OWN accounts or into cash: own-account or wallet top-up transfer, ' +
  'ATM or cash withdrawal, paying your credit-card BILL (paying the card company, not buying with the card). ' +
  'Either direction. Set transfer_reason to cash_withdrawal, card_bill or own_account; for any other kind it is null.\n' +
  '- kind=payback: money received BACK for something paid before: refund, cashback, reversal of a failed or cancelled payment. Always a credit. A person sending you money is kind=income.\n' +
  "- A purchase made WITH a credit card is kind=spend; paying the card's bill is kind=transfer.\n";

const COUNTERPARTY_RULES =
  '- counterparty_type=person: payment to/from a named individual or family member.\n' +
  '- counterparty_type=self_transfer: own-account or wallet top-up transfer.\n' +
  '- counterparty_type=merchant: shop, restaurant, service, hospital, brand.\n' +
  '- counterparty_type=unknown: cannot determine.\n';

const NOTE_RULES =
  '- note: write ONE sentence that a human would naturally say about this transaction. ' +
  'Use the merchant name, item purchased, or visit purpose. ' +
  "Examples: 'Lunch at Subway', 'Running shoes from Puma', 'OPD visit at Apollo for consultation', " +
  "'Electricity bill for May', 'Transferred to Rahul for dinner split'. " +
  "Do NOT write 'Auto-parsed from...', do NOT repeat the category name, do NOT be generic.\n" +
  '- If nothing meaningful can be inferred → null.\n';

function categoryBlock(allowed: readonly string[] | null | undefined): string {
  const cats = allowed && allowed.length > 0 ? allowed.join(', ') : 'Other';
  return (
    `- category: must be exactly one of: ${cats}.\n` +
    "- Prefer the user's custom category names when they clearly fit; " +
    'otherwise use a system category from the list.\n' +
    "- If uncertain → 'Other' if present, else closest match from the list.\n" +
    '- Never invent a category name outside this list.\n'
  );
}

const orNa = (text: string | null | undefined) => text?.trim() || 'N/A';

export function buildReceiptParsePrompt(
  ocrText: string | null | undefined,
  allowedCategories?: readonly string[] | null,
  reference?: DateReference,
): string {
  return (
    'Extract transaction from receipt text (OCR below). Return ONLY valid JSON, no markdown.\n' +
    `Schema: ${SCHEMA}\n` +
    'Rules:\n' +
    TYPE_RULES +
    CURRENCY_RULES +
    KIND_RULES +
    DATE_RULES +
    referenceRules(reference) +
    COUNTERPARTY_RULES +
    categoryBlock(allowedCategories) +
    NOTE_RULES +
    '- Primary source: OCR text block below.\n' +
    '- amount: use the TOTAL/GRAND TOTAL line, not subtotal.\n' +
    '- If receipt is a bill (electricity, water, etc.) → type=debit.\n' +
    '- Use null for unknown fields. Never invent values.\n' +
    'Receipt OCR text:\n---\n' +
    orNa(ocrText) +
    '\n---'
  );
}

export function buildVoiceParsePrompt(
  transcript: string | null | undefined,
  allowedCategories?: readonly string[] | null,
  reference?: DateReference,
): string {
  return (
    'Extract transaction from voice transcript below. Return ONLY valid JSON, no markdown.\n' +
    `Schema: ${SCHEMA}\n` +
    'Rules:\n' +
    TYPE_RULES +
    CURRENCY_RULES +
    KIND_RULES +
    DATE_RULES +
    referenceRules(reference) +
    COUNTERPARTY_RULES +
    categoryBlock(allowedCategories) +
    NOTE_RULES +
    "- Infer intent from natural speech (e.g. 'I spent 200 on lunch' → debit, food).\n" +
    (reference ? '' : "- If speaker says 'today'/'yesterday' and no date context → null.\n") +
    '- Use null for unknown fields. Never invent values.\n' +
    'Voice transcript:\n---\n' +
    orNa(transcript) +
    '\n---'
  );
}

export function buildParsePrompt(mode: ParseMode, text: string, allowedCategories: readonly string[], reference?: DateReference): string {
  if (mode === 'receipt') return buildReceiptParsePrompt(text, allowedCategories, reference);
  return buildVoiceParsePrompt(text, allowedCategories, reference);
}

/** Vision OCR prompt (plain text out, no JSON). */
export function buildReceiptOcrPrompt(): string {
  return (
    'Extract ALL visible text from this receipt or bill image.\n' +
    'Rules:\n' +
    '- Return plain text only. No JSON, markdown, or commentary.\n' +
    '- Preserve line order top-to-bottom.\n' +
    '- Keep numbers, currency symbols, dates, and merchant names exactly as shown.\n' +
    '- Include line items, subtotals, tax, and grand total lines if present.\n' +
    '- For Hindi/regional text, transcribe as shown.\n' +
    '- If unreadable, write [unreadable] for that fragment.\n' +
    '- Do not interpret or categorize — transcription only.'
  );
}
