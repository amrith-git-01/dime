"""Tests for SMS capture request schema."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from features.transactions.schemas import SmsCaptureBody


def test_sms_capture_body_accepts_bank_message() -> None:
    body = SmsCaptureBody(
        text="Rs.120.00 debited from your account for OLA CABS UPI payment",
        received_at=datetime(2026, 6, 20, 10, 30, tzinfo=UTC),
        sender="VM-HDFCBK",
    )
    assert "debited" in body.text


def test_sms_capture_body_rejects_short_text() -> None:
    with pytest.raises(ValidationError):
        SmsCaptureBody(text="short")
