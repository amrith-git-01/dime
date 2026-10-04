from __future__ import annotations

import re
from dataclasses import dataclass

import sqlglot
from sqlglot import exp
from sqlglot.errors import SqlglotError
from sqlglot.optimizer.scope import Scope, ScopeType, traverse_scope

from features.agent.schema_context import ALLOWED_TABLES

_DEFAULT_LIMIT = 500
_DIALECT = "postgres"
_PUBLIC_SCHEMA = "public"

# Exact function names that must never run in agent SQL (state changes, config, file/IO,
# server introspection, or executing another SQL string).
_DENIED_FUNCTIONS: frozenset[str] = frozenset({
    "pg_sleep",
    "set_config",
    "current_setting",
    "pg_read_file",
    "pg_read_binary_file",
    "pg_ls_dir",
    "query_to_xml",
    "query_to_xml_and_xmlschema",
    "query_to_xmlschema",
    "table_to_xml",
    "table_to_xml_and_xmlschema",
    "table_to_xmlschema",
    "cursor_to_xml",
    "cursor_to_xmlschema",
    "schema_to_xml",
    "schema_to_xml_and_xmlschema",
    "schema_to_xmlschema",
    "database_to_xml",
    "database_to_xml_and_xmlschema",
    "database_to_xmlschema",
    "nextval",
    "setval",
    "lastval",
    "currval",
    "ts_stat",
})
_DENIED_FUNCTION_PREFIXES: tuple[str, ...] = ("pg_", "dblink", "lo_", "txid_", "has_")

# Table-valued functions allowed in FROM / JOIN (everything else is rejected).
_ALLOWED_TABLE_FUNCTIONS = (exp.GenerateSeries, exp.ExplodingGenerateSeries)

# Statement kinds that may never appear anywhere in the tree (e.g. DML inside a CTE).
_FORBIDDEN_NODES: tuple[type[exp.Expression], ...] = (
    exp.DML,
    exp.DDL,
    exp.Command,
    exp.Into,
    exp.Lock,
    exp.Set,
    exp.Copy,
    exp.Transaction,
    exp.Commit,
    exp.Rollback,
    exp.Use,
)

_SQL_PREVIEW_CHARS = 200


@dataclass(frozen=True, slots=True)
class ValidationResult:
    ok: bool
    sql: str
    error: str | None = None


def _fail(sql: str, error: str) -> ValidationResult:
    return ValidationResult(False, sql, error)


def _function_name(node: exp.Func) -> str:
    if isinstance(node, exp.Anonymous):
        return str(node.name).lower()
    return node.sql_name().lower()


def _denied_function(tree: exp.Expression) -> str | None:
    for node in tree.walk():
        if not isinstance(node, exp.Func):
            continue
        name = _function_name(node)
        if name in _DENIED_FUNCTIONS or name.startswith(_DENIED_FUNCTION_PREFIXES):
            return name
    return None


def _visible_cte_names(scope: Scope) -> set[str]:
    names = {name.lower() for name in scope.cte_sources}
    # A recursive CTE may reference itself from inside its own body.
    cte = scope.expression.parent if scope.scope_type == ScopeType.CTE else None
    if isinstance(cte, exp.CTE) and isinstance(cte.parent, exp.With) and cte.parent.args.get(
        "recursive"
    ):
        names.add(cte.alias_or_name.lower())
    return names


def _disallowed_tables(tree: exp.Expression) -> list[str]:
    """Return every table reference that is not an allowlisted ``public`` table or a visible CTE.

    Tables are checked per scope so a CTE name only shields references that can actually see it.
    """
    allowed = {t.lower() for t in ALLOWED_TABLES}
    bad: set[str] = set()
    seen_nodes = 0
    for scope in traverse_scope(tree):
        visible_ctes = _visible_cte_names(scope)
        for table in scope.tables:
            seen_nodes += 1
            if not isinstance(table.this, exp.Identifier):
                if not isinstance(table.this, _ALLOWED_TABLE_FUNCTIONS):
                    bad.add(table.this.sql(dialect=_DIALECT) if table.this else "<unknown>")
                continue
            name = table.name.lower()
            schema = table.args.get("db")
            catalog = table.args.get("catalog")
            if catalog is not None:
                bad.add(table.sql(dialect=_DIALECT))
            elif schema is not None:
                if schema.name.lower() != _PUBLIC_SCHEMA or name not in allowed:
                    bad.add(f"{schema.name.lower()}.{name}")
            elif name not in visible_ctes and name not in allowed:
                bad.add(name)
    # Fail closed if the scope walk did not see every table node in the tree.
    if seen_nodes != sum(1 for _ in tree.find_all(exp.Table)):
        bad.add("<unresolved table reference>")
    return sorted(bad)


def validate_select_sql(raw_sql: str, *, max_rows: int = _DEFAULT_LIMIT) -> ValidationResult:
    """Validate agent-generated SQL and return a row-limited, re-serialized query.

    Accepts exactly one ``SELECT`` / ``WITH ... SELECT`` (set operations included) that only
    reads allowlisted ``public`` tables. The returned SQL is generated from the parsed tree and
    wrapped as ``SELECT * FROM (<q>) AS _q LIMIT n`` so the row cap always applies.
    """
    sql = raw_sql.strip().rstrip(";").strip()
    if not sql:
        return _fail(sql, "SQL is empty")

    try:
        statements = [s for s in sqlglot.parse(sql, dialect=_DIALECT) if s is not None]
    except SqlglotError as exc:
        return _fail(sql, f"Could not parse SQL: {str(exc)[:_SQL_PREVIEW_CHARS]}")
    if not statements:
        return _fail(sql, "SQL is empty")
    if len(statements) > 1:
        return _fail(sql, "Multiple statements are not allowed")

    tree = statements[0]
    if not isinstance(tree, exp.Query):
        return _fail(sql, "Only SELECT queries are allowed")

    forbidden = next((n for n in tree.walk() if isinstance(n, _FORBIDDEN_NODES)), None)
    if forbidden is not None:
        keyword = re.sub(r"(?<!^)(?=[A-Z])", " ", type(forbidden).__name__).upper()
        return _fail(sql, f"Forbidden SQL keyword detected: {keyword}")

    denied_fn = _denied_function(tree)
    if denied_fn is not None:
        return _fail(sql, f"Forbidden function: {denied_fn}")

    try:
        disallowed = _disallowed_tables(tree)
    except SqlglotError as exc:
        return _fail(sql, f"Could not resolve tables: {str(exc)[:_SQL_PREVIEW_CHARS]}")
    if disallowed:
        return _fail(sql, f"Disallowed tables: {', '.join(disallowed)}")

    limit = max(1, int(max_rows))
    wrapped = (
        exp.select("*")
        .from_(exp.Subquery(this=tree, alias=exp.TableAlias(this=exp.to_identifier("_q"))))
        .limit(limit)
    )
    return ValidationResult(True, wrapped.sql(dialect=_DIALECT))
