const TRANSACTION_KEYWORDS =
  /\b(debit|debited|credited|credit|spent|paid|rs\.?|inr|upi|neft|imps|txn|transaction)\b/i;

const OTP_OR_PROMO =
  /\b(otp|one time password|verification code|offer|cashback|win|lottery|promo)\b/i;

/** Cheap on-device gate before sending SMS text to the API. */
export function isTransactionSms(text: string, sender = ""): boolean {
  const body = text.trim();
  if (body.length < 20) {
    return false;
  }
  if (OTP_OR_PROMO.test(body)) {
    return false;
  }
  if (!TRANSACTION_KEYWORDS.test(body)) {
    return false;
  }
  const senderLower = sender.trim().toLowerCase();
  if (senderLower.length > 0 && /\b(ads?|promo|offer)\b/.test(senderLower)) {
    return false;
  }
  return true;
}
