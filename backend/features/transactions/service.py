"""Transaction list and create orchestration."""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any

from supabase import Client

from core.security import CurrentUser
from features.transactions.repository import TransactionRepository
from features.transactions.schemas import (
    HomeOverviewResponse,
    MonthSummaryResponse,
    TopCategoryRow,
    TransactionCreate,
    TransactionListResponse,
    TransactionResponse,
)
from features.transactions.time_bounds import (
    current_month_bounds_iso,
    month_bounds_iso,
    today_bounds_iso,
)


def _to_decimal(value: object) -> Decimal:
    if isinstance(value, Decimal):
        return value.quantize(Decimal("0.01"))
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _flatten_embed(row: dict[str, Any]) -> dict[str, Any]:
    """Lift PostgREST ``categories`` embed; set legacy ``merchant`` from counterparty."""
    flat = dict(row)
    category = flat.pop("categories", None)
    tx_cat_id = flat.get("category_id")
    if isinstance(category, dict):
        name = category.get("name")
        flat["category"] = name.strip() if isinstance(name, str) and name.strip() else None
        embed_id = category.get("id")
        if tx_cat_id is not None:
            flat["category_id"] = str(tx_cat_id).strip() or None
        elif embed_id is not None:
            flat["category_id"] = str(embed_id)
        else:
            flat["category_id"] = None
        em = category.get("icon_name")
        flat["category_icon_name"] = em if isinstance(em, str) else None
        col = category.get("color")
        flat["category_color"] = col if isinstance(col, str) else None
    else:
        flat["category"] = None
        flat["category_id"] = str(tx_cat_id) if tx_cat_id is not None else None
        flat["category_icon_name"] = None
        flat["category_color"] = None

    cp = flat.get("counterparty_name")
    flat["merchant"] = cp.strip() if isinstance(cp, str) and cp.strip() else ""

    return flat


class TransactionService:
    def __init__(self, supabase: Client) -> None:
        self._repo = TransactionRepository(supabase)

    def list_mine(self, user: CurrentUser) -> list[TransactionResponse]:
        rows = self._repo.list_for_user(user.id)
        return [
            TransactionResponse.model_validate(row)
            for row in self._enrich_rows(user.id, rows)
        ]

    def list_mine_paginated(
        self,
        user: CurrentUser,
        *,
        from_iso: str | None,
        to_iso: str | None,
        limit: int = 50,
        offset: int = 0,
    ) -> TransactionListResponse:
        rows, has_more = self._repo.list_for_user_paginated(
            user.id,
            from_iso=from_iso,
            to_iso=to_iso,
            limit=limit,
            offset=offset,
        )
        items = [
            TransactionResponse.model_validate(row)
            for row in self._enrich_rows(user.id, rows)
        ]
        return TransactionListResponse(items=items, has_more=has_more)

    def month_summary(
        self,
        user: CurrentUser,
        *,
        year: int,
        month: int,
        timezone: str,
    ) -> MonthSummaryResponse:
        start, end = month_bounds_iso(year, month, timezone)
        blob = self._repo.fetch_transactions_period_summary(
            user.id,
            from_iso=start,
            to_iso=end,
        )
        if blob is not None:
            credit = _to_decimal(blob["credit_total"])
            debit = _to_decimal(blob["debit_total"])
            net = credit - debit
            count_raw = blob.get("transaction_count", 0)
            try:
                count = int(count_raw)  # JSON may return int or str
            except (TypeError, ValueError):
                count = 0
            return MonthSummaryResponse(
                credit_total=format(credit, "f"),
                debit_total=format(debit, "f"),
                net=format(net, "f"),
                transaction_count=count,
            )

        rows = self._repo.iter_amount_type_category(user.id, from_iso=start, to_iso=end)
        credit = Decimal("0")
        debit = Decimal("0")
        for r in rows:
            amt = _to_decimal(r.get("amount", "0"))
            t = r.get("type")
            if t == "credit":
                credit += amt
            elif t == "debit":
                debit += amt
        net = credit - debit
        return MonthSummaryResponse(
            credit_total=format(credit, "f"),
            debit_total=format(debit, "f"),
            net=format(net, "f"),
            transaction_count=len(rows),
        )

    def home_overview(self, user: CurrentUser, *, timezone: str) -> HomeOverviewResponse:
        t_start, t_end = today_bounds_iso(timezone)
        m_start, m_end = current_month_bounds_iso(timezone)

        spent_today = Decimal("0")
        today_blob = self._repo.fetch_transactions_period_summary(
            user.id,
            from_iso=t_start,
            to_iso=t_end,
        )
        if today_blob is not None:
            spent_today = _to_decimal(today_blob["debit_total"])
        else:
            today_rows = self._repo.iter_amount_type_category(
                user.id, from_iso=t_start, to_iso=t_end
            )
            for r in today_rows:
                if r.get("type") == "debit":
                    spent_today += _to_decimal(r.get("amount", "0"))

        spent_month = Decimal("0")
        debit_by_category: dict[str | None, Decimal] = {}
        month_blob = self._repo.fetch_transactions_period_summary(
            user.id,
            from_iso=m_start,
            to_iso=m_end,
        )
        if month_blob is not None:
            spent_month = _to_decimal(month_blob["debit_total"])
            raw_cats = month_blob.get("debit_by_category")
            if isinstance(raw_cats, dict):
                for cid_key, total in raw_cats.items():
                    if not isinstance(cid_key, str):
                        continue
                    cat_key: str | None = None if cid_key == "" else cid_key
                    debit_by_category[cat_key] = _to_decimal(total)
        else:
            month_rows = self._repo.iter_amount_type_category(
                user.id, from_iso=m_start, to_iso=m_end
            )
            for r in month_rows:
                amt = _to_decimal(r.get("amount", "0"))
                t = r.get("type")
                if t == "debit":
                    spent_month += amt
                    cid = r.get("category_id")
                    key = str(cid) if cid is not None else None
                    debit_by_category[key] = debit_by_category.get(key, Decimal("0")) + amt

        sorted_cats = sorted(debit_by_category.items(), key=lambda x: x[1], reverse=True)[:5]
        cat_ids = {k for k, _ in sorted_cats if k is not None}
        cat_meta = (
            self._repo.fetch_categories_by_ids(cat_ids, user_id=user.id)
            if cat_ids
            else {}
        )
        top_categories: list[TopCategoryRow] = []
        for cat_id, total in sorted_cats:
            if cat_id is None:
                top_categories.append(
                    TopCategoryRow(
                        category_id=None,
                        name="Uncategorized",
                        icon_name="Package",
                        color=None,
                        total=format(total, "f"),
                    )
                )
                continue
            meta = cat_meta.get(cat_id, {})
            nm = meta.get("name")
            name = nm.strip() if isinstance(nm, str) and nm.strip() else "Uncategorized"
            em = meta.get("icon_name")
            co = meta.get("color")
            top_categories.append(
                TopCategoryRow(
                    category_id=cat_id,
                    name=name,
                    icon_name=em if isinstance(em, str) else None,
                    color=co if isinstance(co, str) else None,
                    total=format(total, "f"),
                )
            )

        recent_raw, _ = self._repo.list_for_user_paginated(
            user.id,
            from_iso=None,
            to_iso=None,
            limit=5,
            offset=0,
        )
        recent_transactions = [
            TransactionResponse.model_validate(row)
            for row in self._enrich_rows(user.id, recent_raw)
        ]

        return HomeOverviewResponse(
            spent_today=format(spent_today, "f"),
            spent_this_month=format(spent_month, "f"),
            top_categories=top_categories,
            recent_transactions=recent_transactions,
        )

    def _normalize_counterparty(self, raw: str) -> str | None:
        lowered = raw.strip().lower()
        lowered = re.sub(r"[^a-z0-9]+", " ", lowered)
        normalized = re.sub(r"\s+", " ", lowered).strip()
        return normalized or None

    def _category_exists(self, user_id: str, category_id: str) -> bool:
        db = self._repo._db  # type: ignore[attr-defined]
        sys_res = (
            db.table("categories")
            .select("id")
            .eq("id", category_id)
            .limit(1)
            .execute()
        )
        if isinstance(sys_res.data, list) and sys_res.data:
            return True
        user_res = (
            db.table("user_categories")
            .select("id")
            .eq("id", category_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        rows = user_res.data if isinstance(user_res.data, list) else []
        return bool(rows)

    def _resolve_category(
        self,
        user_id: str,
        category_name: str | None,
    ) -> tuple[str | None, str | None]:
        if not category_name:
            return None, None
        wanted = category_name.strip().lower()
        if not wanted:
            return None, None

        db = self._repo._db  # type: ignore[attr-defined]
        for table in ("categories", "user_categories"):
            q = db.table(table).select("id,name")
            if table == "user_categories":
                q = q.eq("user_id", user_id)
            res = q.execute()
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

    def _enrich_rows(self, user_id: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        flattened = [_flatten_embed(r) for r in rows]
        missing_ids: set[str] = set()
        for row in flattened:
            if row.get("category"):
                continue
            cid = row.get("category_id")
            if isinstance(cid, str) and cid.strip():
                missing_ids.add(cid.strip())
        if not missing_ids:
            return flattened

        meta = self._repo.fetch_categories_by_ids(missing_ids, user_id=user_id)
        for row in flattened:
            if row.get("category"):
                continue
            cid = row.get("category_id")
            if not isinstance(cid, str):
                continue
            hit = meta.get(cid)
            if not isinstance(hit, dict):
                continue
            nm = hit.get("name")
            row["category"] = nm.strip() if isinstance(nm, str) and nm.strip() else None
            em = hit.get("icon_name")
            row["category_icon_name"] = em if isinstance(em, str) else None
            col = hit.get("color")
            row["category_color"] = col if isinstance(col, str) else None
        return flattened

    def create_manual(self, user: CurrentUser, body: TransactionCreate) -> TransactionResponse:
        category_id = str(body.category_id) if body.category_id is not None else None
        if category_id and not self._category_exists(user.id, category_id):
            category_id = None
        if category_id is None:
            category_id, _ = self._resolve_category(user.id, body.category)

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
        enriched = self._enrich_rows(user.id, [raw])
        return TransactionResponse.model_validate(enriched[0])
