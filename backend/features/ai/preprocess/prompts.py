"""Prompts for Groq preprocess stage (plain text out, no JSON)."""


def build_receipt_ocr_prompt() -> str:
    return (
        "Extract ALL visible text from this receipt or bill image.\n"
        "Rules:\n"
        "- Return plain text only. No JSON, markdown, or commentary.\n"
        "- Preserve line order top-to-bottom.\n"
        "- Keep numbers, currency symbols, dates, and merchant names exactly as shown.\n"
        "- Include line items, subtotals, tax, and grand total lines if present.\n"
        "- For Hindi/regional text, transcribe as shown.\n"
        "- If unreadable, write [unreadable] for that fragment.\n"
        "- Do not interpret or categorize — transcription only."
    )
