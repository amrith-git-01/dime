"""Unit tests for on-device SMS pre-filter."""

from __future__ import annotations

# Mirror of frontend isTransactionSms rules for backend-side tests if needed later.
import re

TRANSACTION_KEYWORDS = re.compile(
    r"\b(debit|debited|credited|credit|spent|paid|rs\.?|inr|upi|neft|imps|txn|transaction)\b",
    re.IGNORECASE,
)
OTP_OR_PROMO = re.compile(
    r"\b(otp|one time password|verification code|offer|cashback|win|lottery|promo)\b",
    re.IGNORECASE,
)


def is_transaction_sms(text: str, sender: str = "") -> bool:
    body = text.strip()
    if len(body) < 20:
        return False
    if OTP_OR_PROMO.search(body):
        return False
    if not TRANSACTION_KEYWORDS.search(body):
        return False
    sender_lower = sender.strip().lower()
    if sender_lower and re.search(r"\b(ads?|promo|offer)\b", sender_lower):
        return False
    return True


def test_accepts_hdfc_debit_sms() -> None:
    body = "Dear Customer, Rs.480.00 debited from A/c **1234 on 20-06-26 at SWIGGY. Avl Bal Rs 12000"
    assert is_transaction_sms(body, "VM-HDFCBK")


def test_rejects_otp_sms() -> None:
    body = "Your OTP for transaction is 482910. Do not share with anyone."
    assert not is_transaction_sms(body, "VM-HDFCBK")


def test_rejects_short_message() -> None:
    assert not is_transaction_sms("Hi there", "BANK")
