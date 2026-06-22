from pydantic import ValidationError

from features.transactions.schemas import SmsBatchRequest


def test_sms_batch_requires_messages() -> None:
    try:
        SmsBatchRequest.model_validate({"messages": []})
    except ValidationError:
        return
    raise AssertionError("empty messages must 422")


def test_sms_batch_rejects_empty_body() -> None:
    try:
        SmsBatchRequest.model_validate(
            {
                "messages": [
                    {"body": "  ", "received_at": "2026-08-14T12:00:00+00:00"},
                ],
            },
        )
    except ValidationError:
        return
    raise AssertionError("blank body must 422")


def test_sms_batch_accepts_one_message() -> None:
    body = SmsBatchRequest.model_validate(
        {
            "messages": [
                {
                    "body": "INR 250.00 debited at SWIGGY",
                    "received_at": "2026-08-14T12:00:00+00:00",
                },
            ],
        },
    )
    assert len(body.messages) == 1
    assert "SWIGGY" in body.messages[0].body
