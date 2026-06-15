"""Validate and enrich LLM-generated TransactionsList deep links."""

from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import ValidationError

from features.agent.schemas import AgentDeepLink
from features.agent.sql_entities import (
    CategoryEntity,
    PayeeEntity,
    SqlEntities,
    extract_sql_entities,
)
from features.agent.time_range import spans_multiple_calendar_months


def validate_deep_link(raw: object) -> dict[str, Any] | None:
    """Return a sanitized deep_link dict, or None if the LLM output is invalid."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        return None
    try:
        link = AgentDeepLink.model_validate(raw)
    except ValidationError:
        return None
    return link.model_dump(exclude_none=True)


def enrich_deep_link(
    link: dict[str, Any] | None,
    time_range: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """
    Attach fromIso/toIso for multi-month periods so TransactionsList loads the full window.
    """
    validated = validate_deep_link(link)
    if validated is None:
        return None

    if not spans_multiple_calendar_months(time_range):
        return validated

    params = validated.get("params")
    if not isinstance(params, dict):
        return validated
    if params.get("filter") not in ("payee", "category"):
        return validated

    start_iso = time_range.get("start_iso") if time_range else None
    end_iso = time_range.get("end_iso") if time_range else None
    end_date = time_range.get("end_date") if time_range else None
    if not isinstance(start_iso, str) or not isinstance(end_iso, str):
        return validated

    enriched_params = dict(params)
    enriched_params["fromIso"] = start_iso
    enriched_params["toIso"] = end_iso
    if isinstance(end_date, str):
        end_day = date.fromisoformat(end_date[:10])
        enriched_params["year"] = end_day.year
        enriched_params["monthIndex0"] = end_day.month - 1

    return validate_deep_link(
        {
            **validated,
            "params": enriched_params,
        }
    )


def _pick_payee(entities: SqlEntities) -> PayeeEntity | None:
    if len(entities.payees) == 1:
        return entities.payees[0]
    return None


def _pick_category(entities: SqlEntities) -> CategoryEntity | None:
    if len(entities.categories) == 1:
        return entities.categories[0]
    return None


def resolve_deep_link_ids(
    link: dict[str, Any] | None,
    *,
    last_result: dict[str, Any] | None,
    time_range: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """
    Enrich time range, then bind payee/category deep links to exact ids from SQL rows.

    Payee links require exactly one ``counterparty_normalized`` in results.
    Category links require exactly one ``category_id``. Otherwise the link is dropped.
    """
    enriched = enrich_deep_link(link, time_range)
    if enriched is None:
        return None

    params = enriched.get("params")
    if not isinstance(params, dict):
        return enriched

    filter_type = params.get("filter")
    if filter_type not in ("payee", "category"):
        return enriched

    entities = extract_sql_entities(last_result)

    if filter_type == "payee":
        payee = _pick_payee(entities)
        if payee is None:
            return None
        resolved_params = dict(params)
        resolved_params["payeeId"] = payee.payee_id
        resolved_params["payeeKey"] = payee.payee_id
        if payee.display_name:
            resolved_params["payeeDisplayName"] = payee.display_name
        return validate_deep_link({**enriched, "params": resolved_params})

    category = _pick_category(entities)
    if category is None:
        return None
    resolved_params = dict(params)
    resolved_params["categoryId"] = category.category_id
    if category.display_name:
        resolved_params["categoryDisplayName"] = category.display_name
    return validate_deep_link({**enriched, "params": resolved_params})
