"""Transaction list and create orchestration."""

from __future__ import annotations

from supabase import Client

from core.security import CurrentUser
from features.transactions.repository import TransactionRepository
from features.transactions.schemas import TransactionCreate, TransactionResponse


class TransactionService:
    def __init__(self, supabase: Client) -> None:
        self._repo = TransactionRepository(supabase)

    def list_mine(self, user: CurrentUser) -> list[TransactionResponse]:
        rows = self._repo.list_for_user(user.id)
        return [TransactionResponse.model_validate(r) for r in rows]

    def create_manual(self, user: CurrentUser, body: TransactionCreate) -> TransactionResponse:
        row = {
            "user_id": user.id,
            "amount": format(body.amount, "f"),
            "type": body.type,
            "merchant": body.merchant,
            "category": body.category,
            "note": body.note,
            "detected_via": body.detected_via or "manual",
            "transaction_at": body.transaction_at.isoformat(),
        }
        raw = self._repo.insert(row)
        return TransactionResponse.model_validate(raw)
