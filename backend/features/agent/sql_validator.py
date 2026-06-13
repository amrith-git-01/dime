from __future__ import annotations

import re
from dataclasses import dataclass

from features.agent.schema_context import ALLOWED_TABLES

_FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|COPY|"
    r"INTO|EXECUTE|CALL|DO|SET|BEGIN|COMMIT|ROLLBACK)\b",
    re.IGNORECASE,
)

_FROM_JOIN = re.compile(
    r"\b(?:FROM|JOIN)\s+([a-zA-Z_][\w]*)",
    re.IGNORECASE,
)

_DEFAULT_LIMIT = 500

@dataclass(frozen=True, slots=True)
class ValidationResult:
    ok: bool
    sql: str
    error: str | None = None

def validate_select_sql(raw_sql: str, *, max_rows : int = _DEFAULT_LIMIT) -> ValidationResult:
    sql = raw_sql.strip().rstrip(";")
    if not sql:
        return ValidationResult(False, sql, "SQL is empty")
    if ";" in sql:
        return ValidationResult(False, sql, "Multiple statements are not allowed")
    if not re.match(r"^SELECT\b", sql, re.IGNORECASE):
        return ValidationResult(False, sql, "Only SELECT queries are allowed")
    if _FORBIDDEN.search(sql):
        return ValidationResult(False, sql, "Forbidden SQL keyword detected")
    tables = {m.group(1).lower() for m in _FROM_JOIN.finditer(sql)}
    disallowed = tables - {t.lower() for t in ALLOWED_TABLES}
    if disallowed:
        return ValidationResult(False, sql, f"Disallowed tables: {', '.join(sorted(disallowed))}")
    if not re.search(r"\bLIMIT\b", sql, re.IGNORECASE):
        sql = f"{sql}\nLIMIT {max_rows}"
    return ValidationResult(True, sql)