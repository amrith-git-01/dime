from __future__ import annotations

import pytest

from features.agent.sql_validator import validate_select_sql


@pytest.mark.parametrize(
    ("sql", "expected"),
    [
        ("SELECT t.id FROM transactions t, pg_roles r", "pg_roles"),
        (
            "SELECT id FROM transactions WHERE user_id IN (SELECT oid::text FROM pg_authid)",
            "pg_authid",
        ),
        ("SELECT * FROM information_schema.tables", "information_schema.tables"),
        ("SELECT * FROM pg_catalog.pg_class", "pg_catalog.pg_class"),
        ("SELECT * FROM other_schema.transactions", "other_schema.transactions"),
        ('SELECT * FROM "pg_roles"', "pg_roles"),
        ("WITH x AS (SELECT * FROM pg_shadow) SELECT * FROM x", "pg_shadow"),
        # A CTE name only shields references that can actually see it.
        (
            "SELECT * FROM pg_roles, (WITH pg_roles AS (SELECT 1) SELECT * FROM pg_roles) q",
            "pg_roles",
        ),
    ],
)
def test_rejects_table_bypass_attempts(sql: str, expected: str) -> None:
    result = validate_select_sql(sql)
    assert result.ok is False
    assert "Disallowed tables" in (result.error or "")
    assert expected in (result.error or "")


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT pg_sleep(10)",
        "SELECT id FROM transactions WHERE pg_sleep(5) IS NULL",
        "SELECT set_config('role', 'postgres', false)",
        "SELECT current_setting('request.jwt.claims')",
        "SELECT pg_read_file('/etc/passwd')",
        "SELECT pg_read_binary_file('/etc/passwd')",
        "SELECT * FROM pg_ls_dir('.')",
        "SELECT dblink_connect('host=evil')",
        "SELECT lo_import('/etc/passwd')",
        "SELECT pg_terminate_backend(1)",
        "SELECT query_to_xml('select * from pg_roles', true, true, '')",
    ],
)
def test_rejects_denied_functions(sql: str) -> None:
    result = validate_select_sql(sql)
    assert result.ok is False
    assert "Forbidden function" in (result.error or "")


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT 1; SELECT 2",
        "SELECT id FROM transactions; DROP TABLE users",
        "WITH d AS (DELETE FROM transactions RETURNING *) SELECT * FROM d",
        "WITH u AS (UPDATE users SET email = 'x' RETURNING *) SELECT * FROM u",
        "SELECT id FROM transactions FOR UPDATE",
        "SELECT * INTO backup FROM transactions",
        "SET ROLE postgres",
        "SELEC garbage (",
    ],
)
def test_rejects_non_read_only_or_malformed(sql: str) -> None:
    assert validate_select_sql(sql).ok is False


def test_accepts_cte_with_join_and_wraps_limit() -> None:
    result = validate_select_sql(
        "WITH spend AS (SELECT category_id, SUM(amount) AS total FROM transactions "
        "WHERE type = 'debit' GROUP BY category_id) "
        "SELECT c.name, spend.total FROM spend JOIN categories c ON c.id = spend.category_id",
        max_rows=25,
    )
    assert result.ok is True
    assert result.sql.startswith("SELECT * FROM (WITH spend AS")
    assert result.sql.endswith(") AS _q LIMIT 25")


def test_accepts_public_qualified_table_and_union() -> None:
    assert validate_select_sql("SELECT id FROM public.transactions").ok is True
    assert validate_select_sql("SELECT id FROM budgets UNION SELECT id FROM categories").ok is True


def test_accepts_generate_series_and_recursive_cte() -> None:
    assert validate_select_sql("SELECT g FROM generate_series(1, 5) AS g").ok is True
    recursive = validate_select_sql(
        "WITH RECURSIVE n AS (SELECT 1 AS a UNION ALL SELECT a + 1 FROM n WHERE a < 5) "
        "SELECT * FROM n"
    )
    assert recursive.ok is True
