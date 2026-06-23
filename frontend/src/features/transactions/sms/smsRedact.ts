const ACCOUNT_TAIL =
  /\b(?:a\/c|acct|account|card)\s*(?:no\.?|number)?\s*(?:xx+|x{2,}|\*+)?\s*\d{3,}\b/gi;

const LAST4_TAIL = /\b(?:xx+|x{2,}|\*+)\d{3,4}\b/gi;

const OTP_CODE =
  /\b(?:otp|one[-\s]?time(?:\s+password)?|verification code)\b[^0-9]{0,12}(\d{4,8})\b/gi;

export function redactSmsBody(body: string): string {
  let next = body.replace(ACCOUNT_TAIL, "A/c ****");
  next = next.replace(LAST4_TAIL, "****");
  next = next.replace(OTP_CODE, (full, digits: string) =>
    full.replace(digits, "****"),
  );
  return next;
}
