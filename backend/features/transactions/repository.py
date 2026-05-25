"""``public.transactions`` access via Supabase service client."""

from __future__ import annotations

import logging
import time
from typing import Any

from supabase import Client

from features.transactions.supabase_http import execute_with_http_retry

logger = logging.getLogger(__name__)

# No PostgREST embed: category_id may point at system or user_categories (no single FK).
# TransactionService enriches name/icon/color after fetch.
_TRANSACTION_SELECT = "*"


def _unwrap_rpc_period_payload(data: object) -> dict[str, Any] | None:
    """Normalize PostgREST RPC payload for ``transactions_period_summary``."""
    if data is None:
        return None
    if isinstance(data, dict) and "credit_total" in data and "debit_total" in data:
        return data
    if isinstance(data, dict):
        inner = data.get("transactions_period_summary")
        if isinstance(inner, dict) and "credit_total" in inner:
            return inner
    if isinstance(data, list) and data:
        return _unwrap_rpc_period_payload(data[0])
    return None


class TransactionRepository:
    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    def list_for_user(self, user_id: str, *, limit: int = 100) -> list[dict[str, Any]]:
        res = (
            self._db.table("transactions")
            .select(_TRANSACTION_SELECT)
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .order("transaction_at", desc=True)
            .limit(limit)
            .execute()
        )
        data = res.data
        if not isinstance(data, list):
            return []
        return [row for row in data if isinstance(row, dict)]

    def list_for_user_paginated(
        self,
        user_id: str,
        *,
        from_iso: str | None = None,
        to_iso: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], bool]:
        """Return up to ``limit`` rows and whether more rows exist after this page."""
        fetch_n = limit + 1
        q = (
            self._db.table("transactions")
            .select(_TRANSACTION_SELECT)
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
        )
        if from_iso is not None:
            q = q.gte("transaction_at", from_iso)
        if to_iso is not None:
            q = q.lte("transaction_at", to_iso)
        end = offset + fetch_n - 1
        res = execute_with_http_retry(
            lambda: q.order("transaction_at", desc=True).range(offset, end).execute()
        )
        data = res.data
        if not isinstance(data, list):
            return [], False
        rows = [row for row in data if isinstance(row, dict)]
        has_more = len(rows) > limit
        if has_more:
            rows = rows[:limit]
        return rows, has_more

    def fetch_transactions_period_summary(
        self,
        user_id: str,
        *,
        from_iso: str | None,
        to_iso: str | None,
    ) -> dict[str, Any] | None:
        """Single RPC round-trip for credit/debit totals, count, and debit-by-category.

        Returns ``None`` if the RPC is missing or fails (caller may fall back to paging).
        """
        if from_iso is None or to_iso is None:
            return None
        try:
            res = execute_with_http_retry(
                lambda: self._db.rpc(
                    "transactions_period_summary",
                    {"p_user_id": user_id, "p_from": from_iso, "p_to": to_iso},
                ).execute()
            )
        except Exception as exc:
            logger.warning(
                "transactions_period_summary RPC failed; falling back to paging: %s",
                exc,
            )
            return None
        parsed = _unwrap_rpc_period_payload(res.data)
        if parsed is None:
            logger.warning(
                "transactions_period_summary RPC returned unexpected shape: %r",
                res.data,
            )
        return parsed

    def iter_amount_type_category(
        self,
        user_id: str,
        *,
        from_iso: str | None = None,
        to_iso: str | None = None,
        page_size: int = 1000,
    ) -> list[dict[str, Any]]:
        """Load amount, type, category_id for aggregation (paged)."""
        all_rows: list[dict[str, Any]] = []
        offset = 0
        while True:
            q = (
                self._db.table("transactions")
                .select("amount,type,category_id")
                .eq("user_id", user_id)
                .is_("deleted_at", "null")
            )
            if from_iso is not None:
                q = q.gte("transaction_at", from_iso)
            if to_iso is not None:
                q = q.lte("transaction_at", to_iso)
            res = execute_with_http_retry(
                lambda: q.order("transaction_at", desc=True)
                .range(offset, offset + page_size - 1)
                .execute()
            )
            data = res.data
            if not isinstance(data, list):
                break
            chunk = [r for r in data if isinstance(r, dict)]
            if not chunk:
                break
            all_rows.extend(chunk)
            if len(chunk) < page_size:
                break
            offset += page_size
            time.sleep(0.02)
        return all_rows

    def fetch_categories_by_ids(
        self,
        ids: set[str],
        *,
        user_id: str | None = None,
    ) -> dict[str, dict[str, Any]]:
        from features.categories.repository import CategoryRepository

        return CategoryRepository.fetch_meta_by_ids(self._db, ids, user_id)

    def insert(self, row: dict[str, Any]) -> dict[str, Any]:
        res = self._db.table("transactions").insert(row).execute()
        data = res.data
        if not isinstance(data, list) or len(data) == 0:
            msg = "Insert returned no row"
            raise RuntimeError(msg)
        first = data[0]
        if not isinstance(first, dict):
            msg = "Insert returned invalid row"
            raise RuntimeError(msg)
        return self.fetch_by_id(first["id"]) or first

    def fetch_by_id(self, transaction_id: str) -> dict[str, Any] | None:
        res = (
            self._db.table("transactions")
            .select(_TRANSACTION_SELECT)
            .eq("id", transaction_id)
            .limit(1)
            .execute()
        )
        data = res.data
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            return None
        return data[0]
