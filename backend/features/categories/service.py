"""Categories read orchestration."""

from __future__ import annotations

from supabase import Client

from features.categories.repository import CategoryRepository
from features.categories.schemas import CategoryResponse


class CategoryService:
    def __init__(self, supabase: Client) -> None:
        self._repo = CategoryRepository(supabase)

    def list_categories(self) -> list[CategoryResponse]:
        rows = self._repo.list_all()
        categories: list[CategoryResponse] = []
        for row in rows:
            category_id = row.get("id")
            name = row.get("name")
            icon_name = row.get("icon_name")
            color = row.get("color")
            is_system = row.get("is_system")
            created_at = row.get("created_at")
            if not isinstance(category_id, str):
                continue
            if not isinstance(name, str):
                continue
            if not isinstance(icon_name, str):
                continue
            if not isinstance(color, str):
                continue
            if not isinstance(is_system, bool):
                is_system = False
            if not isinstance(created_at, str):
                continue
            categories.append(
                CategoryResponse(
                    id=category_id,
                    name=name,
                    icon_name=icon_name,
                    color=color,
                    is_system=is_system,
                    created_at=created_at,
                ),
            )
        return categories
