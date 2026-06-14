from __future__ import annotations

import pytest

from features.agent.sql_validator import validate_select_sql


def test_accepts_simple_select() -> None:
    result = validate_select_sql("SELECT id FROM transactions")
    assert result.ok is True
    assert "LIMIT 500" in result.sql


def test_rejects_empty_sql() -> None:
    result = validate_select_sql("   ")
    assert result.ok is False
    assert result.error == "SQL is empty"


def test_rejects_multi_statement() -> None:
    result = validate_select_sql("SELECT 1; SELECT 2")
    assert result.ok is False
    assert "Multiple statements" in (result.error or "")


def test_rejects_non_select() -> None:
    result = validate_select_sql("DELETE FROM transactions")
    assert result.ok is False
    assert "Only SELECT" in (result.error or "")


def test_rejects_forbidden_keyword() -> None:
    result = validate_select_sql("SELECT * INTO temp FROM transactions")
    assert result.ok is False
    assert "Forbidden SQL keyword" in (result.error or "")


def test_rejects_disallowed_table() -> None:
    result = validate_select_sql("SELECT * FROM secret_table")
    assert result.ok is False
    assert "Disallowed tables" in (result.error or "")


def test_preserves_existing_limit() -> None:
    result = validate_select_sql("SELECT id FROM transactions LIMIT 10")
    assert result.ok is True
    assert result.sql.count("LIMIT") == 1
    assert "LIMIT 10" in result.sql


@pytest.mark.parametrize(
    "table",
    ["transactions", "categories", "budgets", "category_budgets", "users"],
)
def test_allows_core_tables(table: str) -> None:
    result = validate_select_sql(f"SELECT id FROM {table}")
    assert result.ok is True
