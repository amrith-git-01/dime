"""Transaction list and create orchestration."""

from __future__ import annotations

import re
from typing import Any

from supabase import Client

from core.security import CurrentUser
from features.transactions.repository import TransactionRepository
from features.transactions.schemas import TransactionCreate, TransactionResponse


def _flatten_embed(row: dict[str, Any]) -> dict[str, Any]:
    """Lift PostgREST ``categories`` embed; set legacy ``merchant`` from counterparty."""
    flat = dict(row)
    category = flat.pop("categories", None)
    if isinstance(category, dict) and isinstance(category.get("name"), str):
        flat["category"] = category["name"]
    else:
        flat["category"] = None

    cp = flat.get("counterparty_name")
    flat["merchant"] = cp.strip() if isinstance(cp, str) and cp.strip() else ""

    return flat


class TransactionService:
    def __init__(self, supabase: Client) -> None:
        self._repo = TransactionRepository(supabase)

    def list_mine(self, user: CurrentUser) -> list[TransactionResponse]:
        rows = self._repo.list_for_user(user.id)
        return [TransactionResponse.model_validate(_flatten_embed(r)) for r in rows]

    def _normalize_counterparty(self, raw: str) -> str | None:
        lowered = raw.strip().lower()
        lowered = re.sub(r"[^a-z0-9]+", " ", lowered)
        normalized = re.sub(r"\s+", " ", lowered).strip()
        return normalized or None

    def _category_exists(self, category_id: str) -> bool:
        res = (
            self._repo._db.table("categories")  # type: ignore[attr-defined]
            .select("id")
            .eq("id", category_id)
            .limit(1)
            .execute()
        )
        rows = res.data if isinstance(res.data, list) else []
        return bool(rows)

    def _resolve_category(self, category_name: str | None) -> tuple[str | None, str | None]:
        if not category_name:
            return None, None
        wanted = category_name.strip().lower()
        if not wanted:
            return None, None

        res = self._repo._db.table("categories").select("id,name").execute()  # type: ignore[attr-defined]
        rows = res.data if isinstance(res.data, list) else []
        for row in rows:
            if not isinstance(row, dict):
                continue
            name = row.get("name")
            if isinstance(name, str) and name.strip().lower() == wanted:
                cat_id = row.get("id")
                if isinstance(cat_id, str):
                    return cat_id, name.strip()
        return None, None

    def create_manual(self, user: CurrentUser, body: TransactionCreate) -> TransactionResponse:
        category_id = str(body.category_id) if body.category_id is not None else None
        if category_id and not self._category_exists(category_id):
            category_id = None
        if category_id is None:
            category_id, _ = self._resolve_category(body.category)

        name_stripped = body.counterparty_name.strip()
        counterparty_normalized = self._normalize_counterparty(name_stripped)

        row: dict[str, Any] = {
            "user_id": user.id,
            "amount": format(body.amount, "f"),
            "type": body.type,
            "note": body.note,
            "detected_via": body.detected_via or "manual",
            "transaction_at": body.transaction_at.isoformat(),
            "category_id": category_id,
            "receipt_url": body.receipt_url,
            "voice_url": body.voice_url,
            "counterparty_name": name_stripped,
            "counterparty_normalized": counterparty_normalized,
        }
        if body.counterparty_type is not None:
            row["counterparty_type"] = body.counterparty_type

        raw = self._repo.insert(row)
        return TransactionResponse.model_validate(_flatten_embed(raw))
