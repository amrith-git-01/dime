from __future__ import annotations

from html import escape

PAPER = "#FAFAFA"
SURFACE = "#FFFFFF"
INK = "#14151A"
INK_SOFT = "#5B5D68"
INK_FAINT = "#A0A2AD"
LINE = "#EAEAEC"
ACCENT = "#2B3FE0"
SUCCESS = "#1A8754"
DANGER = "#D6394A"
SUNKEN = "#F1F1F3"

_FONT = "'Hanken Grotesk', system-ui, -apple-system, Segoe UI, sans-serif"


def format_inr(raw: str | float | int) -> str:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        value = 0.0
    sign = "-" if value < 0 else ""
    n = abs(value)
    whole = int(round(n)) if abs(n - round(n)) < 0.005 else None
    if whole is not None:
        return f"{sign}₹{whole:,}"
    return f"{sign}₹{n:,.2f}"


def _wrap(inner: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<title>Dime</title>
</head>
<body style="margin:0;padding:0;background:{PAPER};font-family:{_FONT};color:{INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{PAPER};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
{inner}
</table>
</td></tr>
</table>
</body>
</html>"""


def _wordmark() -> str:
    return (
        f'<tr><td style="padding:0 8px 24px;letter-spacing:0.28em;font-size:12px;'
        f'font-weight:700;color:{INK};">DIME</td></tr>'
    )


def _kicker(text: str) -> str:
    return (
        f'<tr><td style="padding:0 8px 8px;font-size:11px;font-weight:600;'
        f'letter-spacing:0.18em;color:{INK_FAINT};">{escape(text)}</td></tr>'
    )


def _hero(text: str) -> str:
    return (
        f'<tr><td style="padding:0 8px 16px;font-size:32px;line-height:40px;'
        f'font-weight:700;letter-spacing:-0.02em;color:{INK};">{escape(text)}</td></tr>'
    )


def _body(text: str) -> str:
    return (
        f'<tr><td style="padding:0 8px 24px;font-size:16px;line-height:24px;'
        f'color:{INK_SOFT};">{escape(text)}</td></tr>'
    )


def _quote(text: str, attribution: str | None = None) -> str:
    credit = ""
    if attribution:
        credit = (
            f'<div style="margin-top:12px;font-size:11px;font-weight:600;'
            f'letter-spacing:0.14em;font-style:normal;color:{INK_FAINT};">'
            f"{escape(attribution)}</div>"
        )
    return (
        f'<tr><td style="padding:0 0 24px;">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="background:{SURFACE};border-radius:24px;">'
        f'<tr><td style="padding:24px 28px;border-left:3px solid {LINE};'
        f'font-size:18px;line-height:28px;font-style:italic;color:{INK};">'
        f"“{escape(text)}”{credit}</td></tr></table></td></tr>"
    )


def _card(inner: str) -> str:
    return (
        f'<tr><td style="padding:0 0 20px;">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="background:{SURFACE};border-radius:24px;">'
        f"{inner}</table></td></tr>"
    )


def _pill(label: str, href: str) -> str:
    return (
        f'<tr><td style="padding:8px 8px 28px;" align="center">'
        f'<a href="{escape(href)}" style="display:inline-block;min-width:220px;'
        f"background:{ACCENT};color:{SURFACE};text-decoration:none;font-size:15px;"
        f'font-weight:600;line-height:50px;border-radius:999px;padding:0 28px;">'
        f"{escape(label)}</a></td></tr>"
    )


def _digest_intro(*, kicker: str, range_label: str, name: str) -> str:
    who = name.strip()
    if "MONTH" in kicker.upper():
        month = range_label.split()[0] if range_label.strip() else "the month"
        title = f"Here's {month}, {who}." if who else f"Here's {month}."
        body = f"{range_label}. Spent, earned, and where it went."
    else:
        title = f"Here's last week, {who}." if who else "Here's last week."
        body = f"{range_label}. Spent, earned, and where it went."
    return _hero(title) + _body(body)


def postcard_html(
    *,
    kicker: str,
    title: str,
    body: str,
    image_url: str,
    alt: str,
) -> str:
    img = (
        f'<tr><td style="background:{PAPER};padding:16px 16px 0;border-radius:24px 24px 0 0;" align="center">'
        f'<img src="{escape(image_url)}" alt="{escape(alt)}" width="360" '
        f'style="width:100%;max-width:360px;height:auto;display:block;border:0;"/>'
        f"</td></tr>"
    )
    copy = (
        f'<tr><td style="padding:16px 24px 24px;">'
        f'<div style="font-size:11px;font-weight:600;letter-spacing:0.16em;color:{INK_FAINT};">'
        f"{escape(kicker)}</div>"
        f'<div style="margin-top:8px;font-size:20px;font-weight:600;color:{INK};">{escape(title)}</div>'
        f'<div style="margin-top:8px;font-size:15px;line-height:22px;color:{INK_SOFT};">{escape(body)}</div>'
        f"</td></tr>"
    )
    return _card(img + copy)


WELCOME_POSTCARDS = (
    {
        "kicker": "01 · CAPTURE",
        "title": "Bank SMS can become expenses.",
        "body": "When you open Dime, we show new bank messages. You keep or skip. Nothing is logged behind your back.",
        "file": "slide-1.png",
    },
    {
        "kicker": "02 · LOG IT YOUR WAY",
        "title": "Receipt, voice, or type.",
        "body": "Snap a bill, say “two hundred chai,” or enter it. Same ledger, three doors.",
        "file": "slide-2.png",
    },
    {
        "kicker": "03 · BUDGETS",
        "title": "Limits with room left.",
        "body": "Monthly, daily, category. The app tells you when you are close — not after you are through.",
        "file": "slide-3.png",
    },
    {
        "kicker": "04 · INSIGHTS",
        "title": "Who you paid. What it cost.",
        "body": "Cashflow, payees, compare this month to last. The indigo is for the number. Everything else stays quiet.",
        "file": "slide-4.png",
    },
    {
        "kicker": "05 · ASK",
        "title": "How much on food last month?",
        "body": "The agent answers in Dime, with charts when they help. Plain language. Your data.",
        "file": "slide-5.png",
    },
)


def render_welcome_html(
    *,
    name: str,
    asset_base: str,
    app_link: str,
    unsubscribe_weekly: str,
    unsubscribe_monthly: str,
    quote_text: str,
    quote_author: str,
) -> str:
    base = asset_base.rstrip("/")
    cards = "".join(
        postcard_html(
            kicker=item["kicker"],
            title=item["title"],
            body=item["body"],
            image_url=f"{base}/{item['file']}",
            alt=item["title"],
        )
        for item in WELCOME_POSTCARDS
    )
    inner = (
        _wordmark()
        + _kicker("WELCOME")
        + _hero(f"You're in, {name}.")
        + _body(
            "Dime is a ledger for the rupees that usually disappear between GPay and “I’ll log it later.” "
            "You already have the account. This is what it is for."
        )
        + _quote(quote_text, quote_author)
        + cards
        + _pill("Open Dime", app_link)
    )
    _ = unsubscribe_weekly, unsubscribe_monthly
    return _wrap(inner)


def _row(
    name: str,
    amount: str,
    bar_pct: float,
    last: bool,
    *,
    tone: str = ACCENT,
    name_html: str | None = None,
) -> str:
    pct = max(0.0, min(1.0, bar_pct))
    width = int(round(pct * 100))
    border = "" if last else f"border-bottom:1px solid {LINE};"
    label = name_html if name_html is not None else escape(name)
    return (
        f'<tr><td style="padding:14px 24px;{border}">'
        f'<table role="presentation" width="100%"><tr>'
        f'<td style="font-size:15px;color:{INK};">{label}</td>'
        f'<td align="right" style="font-size:15px;font-weight:600;color:{tone};">{escape(amount)}</td>'
        f"</tr></table>"
        f'<div style="margin-top:8px;height:6px;background:{SUNKEN};border-radius:999px;">'
        f'<div style="height:6px;width:{width}%;background:{tone};border-radius:999px;"></div>'
        f"</div></td></tr>"
    )


def _custom_pill() -> str:
    return (
        f'<span style="display:inline-block;margin-left:8px;border:1px solid {LINE};'
        f"border-radius:6px;padding:2px 6px;font-size:10px;line-height:12px;"
        f'color:{INK_SOFT};vertical-align:middle;">Custom</span>'
    )


def _empty_block(headline: str, subtext: str) -> str:
    return (
        f'<tr><td style="padding:20px 24px;">'
        f'<div style="font-size:16px;font-weight:600;color:{INK};">{escape(headline)}</div>'
        f'<div style="margin-top:6px;font-size:14px;color:{INK_SOFT};">{escape(subtext)}</div>'
        f"</td></tr>"
    )


def _section_heading(kicker: str) -> str:
    return (
        f'<tr><td style="padding:20px 24px 8px;font-size:11px;'
        f'letter-spacing:0.16em;color:{INK_FAINT};">{escape(kicker)}</td></tr>'
    )


def _ranked_card(
    kicker: str,
    rows: list[tuple[str, str, float]],
    *,
    empty_headline: str,
    empty_subtext: str,
    tone: str = ACCENT,
) -> str:
    heading = _section_heading(kicker)
    if not rows:
        return _card(heading + _empty_block(empty_headline, empty_subtext))
    body = "".join(
        _row(name, format_inr(amt), pct, idx == len(rows) - 1, tone=tone)
        for idx, (name, amt, pct) in enumerate(rows)
    )
    return _card(heading + body)


def _category_card(rows: list[tuple[str, str, float, bool]]) -> str:
    heading = _section_heading("CATEGORIES")
    if not rows:
        return _card(
            heading
            + _empty_block(
                "No spending yet",
                "Categories will show up here once you log an expense.",
            )
        )
    body = "".join(
        _row(
            name,
            format_inr(amt),
            pct,
            idx == len(rows) - 1,
            name_html=escape(name) + (_custom_pill() if is_custom else ""),
        )
        for idx, (name, amt, pct, is_custom) in enumerate(rows)
    )
    return _card(heading + body)


def _expense_row(name: str, date_label: str, amount: str, last: bool) -> str:
    border = "" if last else f"border-bottom:1px solid {LINE};"
    date_html = ""
    if date_label:
        date_html = (
            f'<div style="margin-top:4px;font-size:12px;color:{INK_SOFT};">'
            f"{escape(date_label)}</div>"
        )
    return (
        f'<tr><td style="padding:14px 24px;{border}">'
        f'<table role="presentation" width="100%"><tr>'
        f'<td style="font-size:15px;color:{INK};">{escape(name)}{date_html}</td>'
        f'<td align="right" style="font-size:15px;font-weight:600;color:{ACCENT};'
        f'vertical-align:top;">{escape(format_inr(amount))}</td>'
        f"</tr></table></td></tr>"
    )


def _top_expenses_card(rows: list[tuple[str, str, str]]) -> str:
    heading = _section_heading("TOP EXPENSES")
    if not rows:
        return _card(
            heading
            + _empty_block(
                "No expenses yet",
                "Your largest debits will appear here.",
            )
        )
    body = "".join(
        _expense_row(name, date_label, amt, idx == len(rows) - 1)
        for idx, (name, date_label, amt) in enumerate(rows)
    )
    return _card(heading + body)


def _parse_amount(raw: str) -> float:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return 0.0


def _metric_color(raw: str, *, kind: str) -> str:
    value = _parse_amount(raw)
    if abs(value) < 0.005:
        return INK
    if kind == "income":
        return SUCCESS
    if kind == "spent":
        return DANGER
    return SUCCESS if value > 0 else DANGER


def _metric_cell(label: str, raw: str, *, kind: str, border_left: bool) -> str:
    border = f"border-left:1px solid {LINE};" if border_left else ""
    return (
        f'<td width="33%" align="center" style="padding:16px 8px;{border}">'
        f'<div style="font-size:10px;font-weight:500;letter-spacing:0.6px;'
        f'color:{INK_FAINT};">{escape(label)}</div>'
        f'<div style="margin-top:4px;font-size:16px;font-weight:600;'
        f'color:{_metric_color(raw, kind=kind)};">{escape(format_inr(raw))}</div></td>'
    )


def _metrics_card(*, income: str, spent: str, net: str) -> str:
    cells = (
        f'<tr><td style="padding:4px 8px;">'
        f'<table role="presentation" width="100%"><tr>'
        f"{_metric_cell('Income', income, kind='income', border_left=False)}"
        f"{_metric_cell('Spent', spent, kind='spent', border_left=True)}"
        f"{_metric_cell('Net', net, kind='net', border_left=True)}"
        f"</tr></table></td></tr>"
    )
    return _card(cells)


def _summary_card(
    *,
    kicker: str,
    range_label: str,
    spent: str,
    budget_line: str,
    budget_pct: float | None,
) -> str:
    header = (
        f'<tr><td style="padding:20px 24px 0;">'
        f'<table role="presentation" width="100%"><tr>'
        f'<td style="font-size:11px;font-weight:600;letter-spacing:0.16em;color:{INK_FAINT};">'
        f"{escape(kicker)}</td>"
        f'<td align="right" style="font-size:13px;color:{INK_SOFT};">{escape(range_label)}</td>'
        f"</tr></table></td></tr>"
    )
    if budget_pct is not None:
        used = int(round(max(0.0, min(1.0, budget_pct)) * 100))
        status = (
            f"{escape(budget_line)}"
            f'<span style="color:{INK_FAINT};"> · {used}% used</span>'
        )
        width = int(round(max(0.0, min(1.0, budget_pct)) * 100))
        bar = (
            f'<div style="margin-top:12px;height:5px;background:{SUNKEN};border-radius:999px;">'
            f'<div style="height:5px;width:{width}%;background:{ACCENT};border-radius:999px;"></div>'
            f"</div>"
        )
    else:
        status = escape("No budget set")
        bar = ""
    hero = (
        f'<tr><td style="padding:16px 24px 20px;">'
        f'<div style="font-size:40px;line-height:48px;font-weight:700;letter-spacing:-0.02em;'
        f'color:{ACCENT};">{escape(format_inr(spent))}</div>'
        f'<div style="margin-top:8px;font-size:13px;line-height:18px;color:{INK_SOFT};">'
        f"{status}</div>{bar}</td></tr>"
    )
    return _card(header + hero)


def render_digest_html(
    *,
    kicker: str,
    range_label: str,
    spent: str,
    income: str,
    net: str,
    payees: list[tuple[str, str, float]],
    income_sources: list[tuple[str, str, float]],
    categories: list[tuple[str, str, float, bool]],
    top_expenses: list[tuple[str, str, str]],
    budget_line: str,
    budget_pct: float | None,
    app_link: str,
    unsubscribe_weekly: str,
    unsubscribe_monthly: str,
    quote_text: str,
    quote_author: str,
    name: str = "",
) -> str:
    inner = (
        _wordmark()
        + _digest_intro(kicker=kicker, range_label=range_label, name=name)
        + _quote(quote_text, quote_author)
        + _summary_card(
            kicker=kicker,
            range_label=range_label,
            spent=spent,
            budget_line=budget_line,
            budget_pct=budget_pct,
        )
        + _metrics_card(income=income, spent=spent, net=net)
        + _category_card(categories)
        + _ranked_card(
            "WHO YOU PAID",
            payees,
            empty_headline="No payee data yet",
            empty_subtext="See where your money went once you log expenses.",
        )
        + _ranked_card(
            "WHO PAID YOU",
            income_sources,
            empty_headline="No income recorded",
            empty_subtext="Income sources will show up when credits are logged.",
            tone=SUCCESS,
        )
        + _top_expenses_card(top_expenses)
        + _pill("Open Insights", app_link)
    )
    _ = unsubscribe_weekly, unsubscribe_monthly
    return _wrap(inner)


def render_unsubscribed_html(*, kind: str) -> str:
    label = "weekly" if kind == "weekly" else "monthly"
    inner = (
        _wordmark()
        + _kicker("EMAIL SUMMARIES")
        + _hero(f"{label.capitalize()} letters are off.")
        + _body("You can turn them back on in Dime under Settings → Email summaries.")
    )
    return _wrap(inner)
