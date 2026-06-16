"""Parse and compare agent answers against ground truth."""

from __future__ import annotations

import re
from typing import Any


_INR_RE = re.compile(
    r"₹\s*([\d,]+(?:\.\d+)?)|(?:\*\*)?₹?([\d,]+(?:\.\d+)?)(?:\*\*)?",
)


def extract_inr_amounts(text: str) -> list[float]:
    """Pull numeric amounts from prose (₹ Indian formatting)."""
    amounts: list[float] = []
    for match in _INR_RE.finditer(text):
        raw = match.group(1) or match.group(2)
        if not raw:
            continue
        try:
            amounts.append(float(raw.replace(",", "")))
        except ValueError:
            continue
    return amounts


def amount_close(actual: float, expected: float, *, rel_tol: float = 0.02) -> bool:
    if expected == 0:
        return actual == 0
    return abs(actual - expected) / abs(expected) <= rel_tol


def find_matching_amount(
    answer: str, expected: float, *, rel_tol: float = 0.02
) -> float | None:
    for amt in extract_inr_amounts(answer):
        if amount_close(amt, expected, rel_tol=rel_tol):
            return amt
    return None


def verify_response(
    *,
    scenario_id: str,
    question: str,
    answer: str,
    blocks: list[dict[str, Any]],
    deep_link: dict[str, Any] | None,
    ground_truth: dict[str, Any] | None,
    expect_clarification: bool = False,
    expect_chart: str | None = None,
    chart_required: bool = True,
    expect_deep_link: bool = False,
    expect_payee_id: str | None = None,
) -> dict[str, Any]:
    """Return a result row for the smoke report."""
    checks: list[dict[str, Any]] = []
    passed = True

    if expect_clarification:
        ok = "30 days" in answer and len(blocks) == 0
        checks.append({"check": "clarification_no_chart", "ok": ok})
        passed = passed and ok
        return _row(scenario_id, question, answer, blocks, deep_link, ground_truth, checks, passed)

    if ground_truth is None:
        checks.append({"check": "ground_truth", "ok": False, "detail": "no resolver"})
        return _row(scenario_id, question, answer, blocks, deep_link, ground_truth, checks, False)

    kind = ground_truth.get("kind")

    if kind == "compare":
        for key in ("period_a_total", "period_b_total"):
            expected = float(ground_truth[key])
            matched = find_matching_amount(answer, expected)
            ok = matched is not None
            checks.append(
                {
                    "check": f"answer_contains_{key}",
                    "ok": ok,
                    "expected": expected,
                    "matched": matched,
                }
            )
            passed = passed and ok

    elif kind == "current_month" and "monthly_budget" in ground_truth:
        spent = float(ground_truth["total"])
        budget = float(ground_truth["monthly_budget"])
        spent_match = find_matching_amount(answer, spent)
        budget_match = find_matching_amount(answer, budget)
        checks.append(
            {
                "check": "answer_contains_spent",
                "ok": spent_match is not None,
                "expected": spent,
                "matched": spent_match,
            }
        )
        checks.append(
            {
                "check": "answer_contains_budget",
                "ok": budget_match is not None,
                "expected": budget,
                "matched": budget_match,
            }
        )
        passed = passed and spent_match is not None and budget_match is not None

    elif "top_category_total" in ground_truth:
        expected = float(ground_truth["top_category_total"])
        matched = find_matching_amount(answer, expected)
        ok = matched is not None
        checks.append(
            {
                "check": "answer_contains_top_category_total",
                "ok": ok,
                "expected": expected,
                "matched": matched,
                "category": ground_truth.get("top_category_name"),
            }
        )
        passed = passed and ok

    elif "payee_total" in ground_truth:
        expected = float(ground_truth["payee_total"])
        matched = find_matching_amount(answer, expected)
        ok = matched is not None
        checks.append(
            {
                "check": "answer_contains_payee_total",
                "ok": ok,
                "expected": expected,
                "matched": matched,
            }
        )
        passed = passed and ok

    else:
        expected = float(ground_truth.get("total", 0))
        matched = find_matching_amount(answer, expected)
        if matched is None and expected == 0:
            zero_phrases = ("₹0", "no spending", "zero-expense", "zero expense", "didn't spend")
            ok = any(p in answer.lower() for p in zero_phrases)
            checks.append(
                {
                    "check": "answer_indicates_zero_spend",
                    "ok": ok,
                    "expected": expected,
                }
            )
            passed = passed and ok
        else:
            ok = matched is not None
            checks.append(
                {
                    "check": "answer_contains_total",
                    "ok": ok,
                    "expected": expected,
                    "matched": matched,
                }
            )
            passed = passed and ok

    if expect_chart:
        chart_kinds = [
            b.get("chart_kind")
            for b in blocks
            if b.get("type") == "mini_chart"
        ]
        ok = expect_chart in chart_kinds
        checks.append(
            {
                "check": f"chart_kind_{expect_chart}",
                "ok": ok,
                "actual": chart_kinds,
                "required": chart_required,
            }
        )
        if chart_required:
            passed = passed and ok

    if expect_deep_link:
        ok = deep_link is not None and deep_link.get("screen") == "TransactionsList"
        checks.append({"check": "deep_link_present", "ok": ok})
        passed = passed and ok
        if expect_payee_id and deep_link:
            params = deep_link.get("params") or {}
            pid = params.get("payeeId") or params.get("payeeKey")
            ok = pid == expect_payee_id
            checks.append(
                {
                    "check": "deep_link_payee_id",
                    "ok": ok,
                    "expected": expect_payee_id,
                    "actual": pid,
                }
            )
            passed = passed and ok

    return _row(scenario_id, question, answer, blocks, deep_link, ground_truth, checks, passed)


def _row(
    scenario_id: str,
    question: str,
    answer: str,
    blocks: list[dict[str, Any]],
    deep_link: dict[str, Any] | None,
    ground_truth: dict[str, Any] | None,
    checks: list[dict[str, Any]],
    passed: bool,
) -> dict[str, Any]:
    return {
        "id": scenario_id,
        "question": question,
        "passed": passed,
        "answer": answer,
        "blocks": blocks,
        "deep_link": deep_link,
        "ground_truth": ground_truth,
        "checks": checks,
    }
