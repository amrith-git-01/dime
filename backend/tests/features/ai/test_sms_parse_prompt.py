from features.ai.prompts.transaction_parse_prompts import build_sms_parse_prompt
from features.ai.schemas import ParseMode


def test_parse_mode_includes_sms() -> None:
    assert ParseMode.sms.value == "sms"


def test_sms_prompt_embeds_body_and_schema() -> None:
    prompt = build_sms_parse_prompt(
        "INR 250.00 debited from A/c **** at SWIGGY",
        allowed_categories=["Food", "Other"],
    )
    assert "SWIGGY" in prompt
    assert "debited" in prompt.lower()
    assert "Food" in prompt
    assert "ONLY valid JSON" in prompt
