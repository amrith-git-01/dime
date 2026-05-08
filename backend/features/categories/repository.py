"""``public.categories`` read access via Supabase service client."""

from __future__ import annotations

from typing import Any

from supabase import Client


class CategoryRepository:
    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    def list_all(self) -> list[dict[str, Any]]:
        res = (
            self._db.table("categories")
            .select("id,name,emoji,color,is_system,created_at")
            .order("name", desc=False)
            .execute()
        )
        data = res.data
        if not isinstance(data, list):
            return []
        return [row for row in data if isinstance(row, dict)]
