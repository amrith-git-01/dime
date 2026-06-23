import { SMS_SESSION_CAP, type InboxSms } from "./smsTypes";

const MONEY_VERB =
  /\b(debited|credited|spent|withdrawn|received|upi|imps|neft|rtgs|pos|atm)\b/i;

const AMOUNT_SHAPE = /(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d{1,2})?/i;

const OTP_HINT = /\b(otp|one[-\s]?time(?:\s+password)?|verification code)\b/i;

const PROMO_HINT = /unsubscribe|%\s*off|limited offer|click here to avail/i;

const BANK_UPI_TOKENS = [
  "hdfc",
  "icici",
  "sbi",
  "axis",
  "kotak",
  "yesbnk",
  "yesbank",
  "idfc",
  "pnb",
  "bobtxn",
  "bob",
  "baroda",
  "federal",
  "indusind",
  "idbi",
  "canara",
  "canbnk",
  "rbl",
  "citibank",
  "citibk",
  "amex",
  "gpay",
  "google pay",
  "phonepe",
  "paytm",
  "bhim",
  "amazonpay",
  "amazon pay",
  "mobikwik",
  "freecharge",
] as const;

function digitsOnlyPhone(address: string): string {
  return address.replace(/[\s\-()]/g, "");
}

export function isPersonalMobileSender(address: string): boolean {
  const raw = digitsOnlyPhone(address);
  const stripped = raw.replace(/^\+?91/, "").replace(/^0/, "");
  return /^\d{10}$/.test(stripped);
}

export function hasMoneyVerb(body: string): boolean {
  return MONEY_VERB.test(body);
}

export function hasAmountShape(body: string): boolean {
  return AMOUNT_SHAPE.test(body);
}

export function isBankOrUpiSender(address: string): boolean {
  const lower = address.toLowerCase();
  return BANK_UPI_TOKENS.some((token) => lower.includes(token));
}

export function shouldKeepSms(
  sms: Pick<InboxSms, "address" | "body">,
): boolean {
  if (isPersonalMobileSender(sms.address)) {
    return false;
  }

  const otpish = OTP_HINT.test(sms.body);
  const promo = PROMO_HINT.test(sms.body);
  const moneyVerb = hasMoneyVerb(sms.body);
  const amount = hasAmountShape(sms.body);

  if (otpish && !moneyVerb) {
    return false;
  }
  if (promo && !(moneyVerb && amount)) {
    return false;
  }

  if (isBankOrUpiSender(sms.address)) {
    return true;
  }
  return amount && moneyVerb;
}

export function collectKeptSms(
  messages: InboxSms[],
  cap: number = SMS_SESSION_CAP,
): { kept: InboxSms[]; inspectedMaxDateMs: number | null } {
  let inspectedMaxDateMs: number | null = null;
  for (const message of messages) {
    if (inspectedMaxDateMs === null || message.dateMs > inspectedMaxDateMs) {
      inspectedMaxDateMs = message.dateMs;
    }
  }

  const kept = messages
    .filter((message) => shouldKeepSms(message))
    .sort((a, b) => a.dateMs - b.dateMs || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, cap));

  return { kept, inspectedMaxDateMs };
}
