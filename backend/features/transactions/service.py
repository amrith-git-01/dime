"""Transaction list and create orchestration."""

from __future__ import annotations

import re
from typing import Any

from supabase import Client

from core.security import CurrentUser
from features.transactions.repository import TransactionRepository
from features.transactions.schemas import TransactionCreate, TransactionResponse


def _flatten_embed(row: dict[str, Any]) -> dict[str, Any]:
    """Lift PostgREST FK embeds (``merchants``/``categories``) into flat fields."""
    flat = dict(row)
    merchant = flat.pop("merchants", None)
    category = flat.pop("categories", None)
    if isinstance(merchant, dict) and isinstance(merchant.get("name"), str):
        flat["merchant"] = merchant["name"]
    else:
        flat["merchant"] = ""
    if isinstance(category, dict) and isinstance(category.get("name"), str):
        flat["category"] = category["name"]
    else:
        flat["category"] = None
    return flat


class TransactionService:
    def __init__(self, supabase: Client) -> None:
        self._repo = TransactionRepository(supabase)

    def list_mine(self, user: CurrentUser) -> list[TransactionResponse]:
        rows = self._repo.list_for_user(user.id)
        return [TransactionResponse.model_validate(_flatten_embed(r)) for r in rows]

    def _normalize_merchant(self, raw: str) -> str:
        lowered = raw.strip().lower()
        lowered = re.sub(r"[^a-z0-9]+", " ", lowered)
        return re.sub(r"\s+", " ", lowered).strip()

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

    def _get_or_create_merchant_id(self, name: str, *, category_id: str | None) -> str | None:
        normalized = self._normalize_merchant(name)
        if not normalized:
            return None

        existing = (
            self._repo._db.table("merchants")  # type: ignore[attr-defined]
            .select("id,category_id")
            .eq("normalized_name", normalized)
            .limit(1)
            .execute()
        )
        rows = existing.data if isinstance(existing.data, list) else []
        if rows and isinstance(rows[0], dict):
            raw_id = rows[0].get("id")
            if isinstance(raw_id, str) and raw_id:
                merchant_id = raw_id
                # If merchant has no category yet and we have one, attach it.
                if category_id and rows[0].get("category_id") is None:
                    self._repo._db.table("merchants").update(  # type: ignore[attr-defined]
                        {"category_id": category_id}
                    ).eq("id", merchant_id).execute()
                return merchant_id

        inserted = (
            self._repo._db.table("merchants")  # type: ignore[attr-defined]
            .insert(
                {
                    "name": name.strip(),
                    "normalized_name": normalized,
                    "category_id": category_id,
                }
            )
            .execute()
        )
        data = inserted.data
        if isinstance(data, list) and data and isinstance(data[0], dict):
            mid = data[0].get("id")
            if isinstance(mid, str):
                return mid
        return None

    def create_manual(self, user: CurrentUser, body: TransactionCreate) -> TransactionResponse:
        category_id = str(body.category_id) if body.category_id is not None else None
        if category_id and not self._category_exists(category_id):
            category_id = None
        if category_id is None:
            category_id, _ = self._resolve_category(body.category)
        merchant_id = self._get_or_create_merchant_id(body.merchant, category_id=category_id)

        row = {
            "user_id": user.id,
            "amount": format(body.amount, "f"),
            "type": body.type,
            "note": body.note,
            "detected_via": body.detected_via or "manual",
            "transaction_at": body.transaction_at.isoformat(),
            "merchant_id": merchant_id,
            "category_id": category_id,
        }
        raw = self._repo.insert(row)
        return TransactionResponse.model_validate(_flatten_embed(raw))
