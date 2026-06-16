"""Extract payee/category identifiers from agent SQL result rows."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class PayeeEntity:
    """Stable payee identifier — exact ``counterparty_normalized`` from the database."""

    payee_id: str
    display_name: str | None = None


@dataclass(frozen=True, slots=True)
class CategoryEntity:
    category_id: str
    display_name: str | None = None


@dataclass(frozen=True, slots=True)
class SqlEntities:
    payees: tuple[PayeeEntity, ...]
    categories: tuple[CategoryEntity, ...]


def _non_empty_str(value: object) -> str | None:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped:
            return stripped
    return None


def _row_payee(row: dict[str, Any]) -> PayeeEntity | None:
    payee_id = _non_empty_str(row.get("counterparty_normalized"))
    if payee_id is None:
        payee_id = _non_empty_str(row.get("payee_id"))
    if payee_id is None:
        payee_id = _non_empty_str(row.get("payee_key"))
    if payee_id is None:
        return None
    display = _non_empty_str(row.get("counterparty_name")) or _non_empty_str(
        row.get("payee_display_name")
    )
    return PayeeEntity(payee_id=payee_id, display_name=display)


def _row_category(row: dict[str, Any]) -> CategoryEntity | None:
    category_id = _non_empty_str(row.get("category_id"))
    if category_id is None:
        category_id = _non_empty_str(row.get("id"))
        # Only treat bare id as category when paired with a category name column.
        if category_id is not None and _non_empty_str(row.get("category_name")) is None:
            if _non_empty_str(row.get("name")) is None:
                category_id = None
    if category_id is None:
        return None
    display = (
        _non_empty_str(row.get("category_name"))
        or _non_empty_str(row.get("category_display_name"))
        or _non_empty_str(row.get("name"))
    )
    return CategoryEntity(category_id=category_id, display_name=display)


def extract_sql_entities(last_result: dict[str, Any] | None) -> SqlEntities:
    """Collect distinct payee/category ids present in SQL result rows."""
    if not isinstance(last_result, dict):
        return SqlEntities(payees=(), categories=())

    rows = last_result.get("rows")
    if not isinstance(rows, list):
        return SqlEntities(payees=(), categories=())

    payee_by_id: dict[str, PayeeEntity] = {}
    category_by_id: dict[str, CategoryEntity] = {}

    for raw in rows:
        if not isinstance(raw, dict):
            continue
        payee = _row_payee(raw)
        if payee is not None:
            existing = payee_by_id.get(payee.payee_id)
            if existing is None or (existing.display_name is None and payee.display_name):
                payee_by_id[payee.payee_id] = payee
        category = _row_category(raw)
        if category is not None:
            existing = category_by_id.get(category.category_id)
            if existing is None or (
                existing.display_name is None and category.display_name
            ):
                category_by_id[category.category_id] = category

    return SqlEntities(
        payees=tuple(payee_by_id.values()),
        categories=tuple(category_by_id.values()),
    )
