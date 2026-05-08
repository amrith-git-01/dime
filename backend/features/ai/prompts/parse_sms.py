from __future__ import annotations


def build_sms_parse_prompt(sms_text: str, allowed_categories: list[str] | None = None) -> str:
    source_text = sms_text.strip()
    categories_line = ", ".join(allowed_categories or [])
    category_rules = (
        "- Category must be exactly one value from Allowed categories.\n"
        "- If uncertain, choose \"Other\" when present; otherwise choose closest allowed category.\n"
        f"Allowed categories: {categories_line or 'Other'}\n"
    )
    return (
        "Extract transaction fields from SMS/notification and return ONLY valid JSON.\n"
        "Schema:\n"
        "{"
        '"counterparty_name": string, '
        '"counterparty_type": "merchant"|"person"|"self_transfer"|"unknown", '
        '"amount": number, '
        '"type": "debit"|"credit", '
        '"date": "ISO-8601 datetime or null", '
        '"category": string, '
        '"note": string or null, '
        '"confidence": number between 0 and 1, '
        '"raw_model": string'
        "}\n"
        "Rules:\n"
        "- If payment is to friend/family, counterparty_type=person.\n"
        "- If own-account transfer, counterparty_type=self_transfer.\n"
        f"{category_rules}"
        "- Keep note concise and relevant to transaction context.\n"
        "- Use null when field is unknown; do not invent impossible values.\n"
        "Input mode: SMS\n"
        f"Text input: {source_text}"
    )
