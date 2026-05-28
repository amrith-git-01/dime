from __future__ import annotations

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_SCHEMA = (
    '{"counterparty_name":string,'
    '"counterparty_type":"merchant"|"person"|"self_transfer"|"unknown",'
    '"amount":number,'
    '"type":"debit"|"credit",'
    '"date":"YYYY-MM-DD"|null,'
    '"category":string,'
    '"note":string|null,'
    '"confidence":0-1,'
    '"raw_model":string}'
)

_DATE_RULES = (
    "- Date formats accepted: YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DD Mon YYYY (e.g. 23-Feb-2025), "
    "Mon DD YYYY, YYYY/MM/DD. Always output YYYY-MM-DD. If ambiguous or unreadable → null.\n"
)

_TYPE_RULES = (
    "- type=debit: money LEFT your account (purchase, withdrawal, payment, transfer out).\n"
    "- type=credit: money ARRIVED in your account (refund, salary, incoming transfer).\n"
    "- CRITICAL: 'paid by credit card' / 'credit card payment' = debit (you spent money). "
    "'credit card' is the payment method, NOT the direction.\n"
    "- CRITICAL: 'debited' in SMS = debit. 'credited' in SMS = credit.\n"
)

_COUNTERPARTY_RULES = (
    "- counterparty_type=person: payment to/from a named individual or family member.\n"
    "- counterparty_type=self_transfer: own-account or wallet top-up transfer.\n"
    "- counterparty_type=merchant: shop, restaurant, service, hospital, brand.\n"
    "- counterparty_type=unknown: cannot determine.\n"
)

_NOTE_RULES = (
    "- note: write ONE sentence that a human would naturally say about this transaction. "
    "Use the merchant name, item purchased, or visit purpose. "
    "Examples: 'Lunch at Subway', 'Running shoes from Puma', 'OPD visit at Apollo for consultation', "
    "'Electricity bill for May', 'Transferred to Rahul for dinner split'. "
    "Do NOT write 'Auto-parsed from...', do NOT repeat the category name, do NOT be generic.\n"
    "- If nothing meaningful can be inferred → null.\n"
)


def _category_block(allowed_categories: list[str] | None) -> str:
    cats = ", ".join(allowed_categories) if allowed_categories else "Other"
    return (
        f"- category: must be exactly one of: {cats}.\n"
        "- Prefer the user's custom category names when they clearly fit; "
        "otherwise use a system category from the list.\n"
        "- If uncertain → 'Other' if present, else closest match from the list.\n"
        "- Never invent a category name outside this list.\n"
    )


# ---------------------------------------------------------------------------
# SMS / Notification prompt
# ---------------------------------------------------------------------------


def build_sms_parse_prompt(
    sms_text: str,
    allowed_categories: list[str] | None = None,
) -> str:
    return (
        "Extract transaction from SMS. Return ONLY valid JSON, no markdown.\n"
        f"Schema: {_SCHEMA}\n"
        "Rules:\n"
        + _TYPE_RULES
        + _DATE_RULES
        + _COUNTERPARTY_RULES
        + _category_block(allowed_categories)
        + _NOTE_RULES
        + "- Use null for unknown fields. Never invent values.\n"
        + f"SMS: {sms_text.strip()}"
    )


# ---------------------------------------------------------------------------
# Receipt / Image prompt
# ---------------------------------------------------------------------------


def build_receipt_parse_prompt(
    context_text: str | None = None,
    allowed_categories: list[str] | None = None,
) -> str:
    ocr_text = context_text.strip() if context_text else "N/A"
    return (
        "Extract transaction from receipt text (OCR below). Return ONLY valid JSON, no markdown.\n"
        f"Schema: {_SCHEMA}\n"
        "Rules:\n"
        + _TYPE_RULES
        + _DATE_RULES
        + _COUNTERPARTY_RULES
        + _category_block(allowed_categories)
        + _NOTE_RULES
        + "- Primary source: OCR text block below.\n"
        + "- amount: use the TOTAL/GRAND TOTAL line, not subtotal.\n"
        + "- If receipt is a bill (electricity, water, etc.) → type=debit.\n"
        + "- Use null for unknown fields. Never invent values.\n"
        + "Receipt OCR text:\n---\n"
        + ocr_text
        + "\n---"
    )


# ---------------------------------------------------------------------------
# Voice / Audio prompt
# ---------------------------------------------------------------------------


def build_voice_parse_prompt(
    context_text: str | None = None,
    allowed_categories: list[str] | None = None,
) -> str:
    transcript = context_text.strip() if context_text else "N/A"
    return (
        "Extract transaction from voice transcript below. Return ONLY valid JSON, no markdown.\n"
        f"Schema: {_SCHEMA}\n"
        "Rules:\n"
        + _TYPE_RULES
        + _DATE_RULES
        + _COUNTERPARTY_RULES
        + _category_block(allowed_categories)
        + _NOTE_RULES
        + "- Infer intent from natural speech (e.g. 'I spent 200 on lunch' → debit, food).\n"
        + "- If speaker says 'today'/'yesterday' and no date context → null.\n"
        + "- Use null for unknown fields. Never invent values.\n"
        + "Voice transcript:\n---\n"
        + transcript
        + "\n---"
    )
