from __future__ import annotations

import hashlib
import hmac
import time
from typing import Literal
from urllib.parse import urlencode

DigestKind = Literal["weekly", "monthly"]

_MAX_AGE_SECONDS = 90 * 24 * 60 * 60


class UnsubscribeSecretError(RuntimeError):
    """``EMAIL_UNSUBSCRIBE_SECRET`` is not configured, so tokens cannot be issued or verified."""


def _require_secret(secret: str | None) -> bytes:
    if not secret or not secret.strip():
        raise UnsubscribeSecretError(
            "EMAIL_UNSUBSCRIBE_SECRET is not set; cannot issue or verify unsubscribe tokens."
        )
    return secret.encode("utf-8")


def sign_unsubscribe_token(
    *,
    secret: str | None,
    user_id: str,
    kind: DigestKind,
    now_ts: int | None = None,
) -> str:
    key = _require_secret(secret)
    issued = now_ts if now_ts is not None else int(time.time())
    payload = f"{user_id}|{kind}|{issued}"
    digest = hmac.new(key, payload.encode("utf-8"), hashlib.sha256)
    return f"{payload}|{digest.hexdigest()}"


def verify_unsubscribe_token(
    *,
    secret: str | None,
    token: str,
    now_ts: int | None = None,
) -> tuple[str, DigestKind] | None:
    key = _require_secret(secret)
    parts = token.split("|")
    if len(parts) != 4:
        return None
    user_id, kind, issued_raw, given = parts
    if kind not in ("weekly", "monthly"):
        return None
    try:
        issued = int(issued_raw)
    except ValueError:
        return None
    now = now_ts if now_ts is not None else int(time.time())
    if now - issued > _MAX_AGE_SECONDS or issued > now + 60:
        return None
    payload = f"{user_id}|{kind}|{issued}"
    expected = hmac.new(key, payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, given):
        return None
    return user_id, kind  # type: ignore[return-value]


def unsubscribe_url(*, public_base: str, token: str) -> str:
    base = public_base.rstrip("/")
    return f"{base}/api/v1/email/unsubscribe?{urlencode({'token': token})}"
