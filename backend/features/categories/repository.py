"""``public.categories`` and ``public.user_categories`` access."""

from __future__ import annotations

from typing import Any

from supabase import Client


class CategoryRepository:
    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    def list_system(self) -> list[dict[str, Any]]:
        res = (
            self._db.table("categories")
            .select("id,name,icon_name,color,is_system,created_at")
            .eq("is_system", True)
            .order("name", desc=False)
            .execute()
        )
        data = res.data
        if not isinstance(data, list):
            return []
        return [row for row in data if isinstance(row, dict)]

    def list_user(self, user_id: str) -> list[dict[str, Any]]:
        res = (
            self._db.table("user_categories")
            .select("id,user_id,name,icon_name,color,created_at")
            .eq("user_id", user_id)
            .order("name", desc=False)
            .execute()
        )
        data = res.data
        if not isinstance(data, list):
            return []
        return [row for row in data if isinstance(row, dict)]

    def count_user_categories(self, user_id: str) -> int:
        res = (
            self._db.table("user_categories")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .execute()
        )
        count = res.count
        return int(count) if isinstance(count, int) else 0

    def insert_user_category(
        self,
        *,
        user_id: str,
        name: str,
        icon_name: str,
        color: str,
    ) -> dict[str, Any]:
        res = (
            self._db.table("user_categories")
            .insert(
                {
                    "user_id": user_id,
                    "name": name,
                    "icon_name": icon_name,
                    "color": color,
                },
            )
            .execute()
        )
        data = res.data
        if not isinstance(data, list) or len(data) == 0:
            msg = "User category insert returned no row."
            raise RuntimeError(msg)
        first = data[0]
        if not isinstance(first, dict):
            msg = "User category insert returned invalid row."
            raise RuntimeError(msg)
        return first

    @staticmethod
    def fetch_meta_by_ids(
        db: Client,
        category_ids: set[str],
        user_id: str | None = None,
    ) -> dict[str, dict[str, Any]]:
        """Resolve category display fields from system or user tables."""
        if not category_ids:
            return {}
        out: dict[str, dict[str, Any]] = {}
        ids = list(category_ids)

        sys_res = db.table("categories").select("id,name,icon_name,color").in_("id", ids).execute()
        sys_data = sys_res.data if isinstance(sys_res.data, list) else []
        for row in sys_data:
            if isinstance(row, dict) and isinstance(row.get("id"), str):
                out[row["id"]] = row

        missing = [cid for cid in ids if cid not in out]
        if not missing or not user_id:
            return out

        user_res = (
            db.table("user_categories")
            .select("id,name,icon_name,color")
            .eq("user_id", user_id)
            .in_("id", missing)
            .execute()
        )
        user_data = user_res.data if isinstance(user_res.data, list) else []
        for row in user_data:
            if isinstance(row, dict) and isinstance(row.get("id"), str):
                out[row["id"]] = row
        return out
