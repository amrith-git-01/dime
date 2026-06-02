"""``public.categories`` access (system defaults + per-user custom rows)."""

from __future__ import annotations

from typing import Any

from supabase import Client


_SELECT = "id,user_id,name,icon_name,color,is_system,created_at"


class CategoryRepository:
    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    def _visible_filter(self, user_id: str) -> str:
        return f"is_system.eq.true,user_id.eq.{user_id}"

    def list_for_user(self, user_id: str) -> list[dict[str, Any]]:
        res = (
            self._db.table("categories")
            .select(_SELECT)
            .or_(self._visible_filter(user_id))
            .order("name", desc=False)
            .execute()
        )
        data = res.data
        if not isinstance(data, list):
            return []
        return [row for row in data if isinstance(row, dict)]

    def count_custom_categories(self, user_id: str) -> int:
        res = (
            self._db.table("categories")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .eq("is_system", False)
            .execute()
        )
        count = res.count
        return int(count) if isinstance(count, int) else 0

    def insert_custom_category(
        self,
        *,
        user_id: str,
        name: str,
        icon_name: str,
        color: str,
    ) -> dict[str, Any]:
        res = (
            self._db.table("categories")
            .insert(
                {
                    "user_id": user_id,
                    "name": name,
                    "icon_name": icon_name,
                    "color": color,
                    "is_system": False,
                },
            )
            .execute()
        )
        data = res.data
        if not isinstance(data, list) or len(data) == 0:
            msg = "Category insert returned no row."
            raise RuntimeError(msg)
        first = data[0]
        if not isinstance(first, dict):
            msg = "Category insert returned invalid row."
            raise RuntimeError(msg)
        return first

    @staticmethod
    def fetch_meta_by_ids(
        db: Client,
        category_ids: set[str],
        user_id: str | None = None,
    ) -> dict[str, dict[str, Any]]:
        """Resolve category display fields from ``public.categories``."""
        if not category_ids:
            return {}
        out: dict[str, dict[str, Any]] = {}
        ids = list(category_ids)

        query = db.table("categories").select("id,name,icon_name,color").in_("id", ids)
        if user_id:
            query = query.or_(f"is_system.eq.true,user_id.eq.{user_id}")
        res = query.execute()
        data = res.data if isinstance(res.data, list) else []
        for row in data:
            if isinstance(row, dict) and isinstance(row.get("id"), str):
                out[row["id"]] = row
        return out

    @staticmethod
    def category_visible_to_user(
        db: Client,
        *,
        user_id: str,
        category_id: str,
    ) -> bool:
        res = (
            db.table("categories")
            .select("id")
            .eq("id", category_id)
            .or_(f"is_system.eq.true,user_id.eq.{user_id}")
            .limit(1)
            .execute()
        )
        rows = res.data if isinstance(res.data, list) else []
        return bool(rows)

    def fetch_by_id_for_user(
        self,
        user_id: str,
        category_id: str,
    ) -> dict[str, Any] | None:
        res = (
            self._db.table("categories")
            .select(_SELECT)
            .eq("id", category_id)
            .or_(self._visible_filter(user_id))
            .maybe_single()
            .execute()
        )
        if res is None:
            return None
        data = res.data
        return data if isinstance(data, dict) else None

    def update_custom_category(
        self,
        *,
        user_id: str,
        category_id: str,
        name: str,
        icon_name: str,
        color: str,
    ) -> dict[str, Any] | None:
        res = (
            self._db.table("categories")
            .update(
                {
                    "name": name,
                    "icon_name": icon_name,
                    "color": color,
                },
            )
            .eq("id", category_id)
            .eq("user_id", user_id)
            .eq("is_system", False)
            .execute()
        )
        data = res.data
        if not isinstance(data, list) or len(data) == 0:
            return None
        first = data[0]
        return first if isinstance(first, dict) else None

    def delete_custom_category(self, *, user_id: str, category_id: str) -> bool:
        res = (
            self._db.table("categories")
            .delete()
            .eq("id", category_id)
            .eq("user_id", user_id)
            .eq("is_system", False)
            .execute()
        )
        data = res.data
        return isinstance(data, list) and len(data) > 0
