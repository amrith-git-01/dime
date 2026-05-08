from __future__ import annotations


def build_receipt_parse_prompt(
    context_text: str | None = None,
    allowed_categories: list[str] | None = None,
) -> str:
    context = context_text.strip() if context_text else ""
    categories_line = ", ".join(allowed_categories or [])
    category_rules = (
        "- Category must be exactly one value from Allowed categories.\n"
        "- If uncertain, choose \"Other\" when present; otherwise choose closest allowed category.\n"
        f"Allowed categories: {categories_line or 'Other'}\n"
    )
    return (
        "Extract transaction fields from receipt image and return ONLY valid JSON.\n"
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
        "- Primary source is receipt image; infer fields from printed/handwritten content.\n"
        "- If receipt implies transfer to person/family, set counterparty_type=person.\n"
        f"{category_rules}"
        "- Keep note concise and relevant to receipt context.\n"
        "- Use null when field is unknown; do not invent impossible values.\n"
        "Input mode: RECEIPT\n"
        f"Optional text context: {context or 'N/A'}"
    )
