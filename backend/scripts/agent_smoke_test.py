"""Run agent smoke scenarios and write a markdown report.

Ground truth is verified via the same Postgres + RLS path as production
(``execute_readonly_sql``). Supabase MCP was unavailable in this environment;
direct SQL against the linked Supabase database is equivalent for verification.

Usage (from ``backend/``)::

    $env:PYTHONPATH='.'
    $env:AGENT_SMOKE_USER_ID='your-user-uuid'
    .venv\\Scripts\\python.exe scripts/agent_smoke_test.py

Optional:
    AGENT_SMOKE_TIMEZONE (default Asia/Kolkata)
    AGENT_SMOKE_REPORT (default ../docs/agent-smoke-results.md)
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

# Ensure backend package root is importable when run as a script.
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from features.agent.schemas import ChatRequest
from features.agent.service import AgentService
from features.agent.sql_executor import close_sql_pool, init_sql_pool
from features.agent.timezone_context import _local_now

from scripts.agent_smoke.ground_truth import ground_truth_for_question
from scripts.agent_smoke.verify import verify_response

DEFAULT_USER = "a02925b4-a065-40ee-be3b-f78132de72a1"
DEFAULT_TZ = "Asia/Kolkata"

SCENARIOS: list[dict[str, Any]] = [
    {
        "id": "month_total",
        "question": "How much did I spend this month?",
    },
    {
        "id": "budget_status",
        "question": "Am I over my monthly budget?",
    },
    {
        "id": "mom_compare",
        "question": "Compare this month vs last month spending",
        "expect_chart": "compare_bar",
        "chart_required": True,
    },
    {
        "id": "payee_zomato",
        "question": "How much did I spend on Zomato this month?",
    },
    {
        "id": "payee_deep_link",
        "question": "Show my Zomato transactions this month",
        "expect_deep_link": True,
        "expect_payee_id": "zomato",
    },
    {
        "id": "last_7_days",
        "question": "What did I spend in the last 7 days?",
    },
    {
        "id": "yesterday",
        "question": "How much did I spend yesterday?",
    },
    {
        "id": "top_categories",
        "question": "What are my top spending categories this month?",
        "expect_chart": "donut",
    },
    {
        "id": "daily_clarification",
        "question": "Show my daily spending for the last 60 days",
        "expect_clarification": True,
        "skip_ground_truth": True,
    },
    {
        "id": "yoy_compare",
        "question": "Compare this year vs last year spending",
        "expect_chart": "compare_bar",
        "chart_required": True,
    },
]


def _report_path() -> Path:
    raw = os.environ.get("AGENT_SMOKE_REPORT", "../docs/agent-smoke-results.md")
    path = Path(raw)
    if not path.is_absolute():
        path = (_BACKEND_ROOT / path).resolve()
    return path


async def _run_scenario(
    service: AgentService,
    *,
    user_id: str,
    timezone: str,
    now: datetime,
    scenario: dict[str, Any],
) -> dict[str, Any]:
    question = scenario["question"]
    started = time.perf_counter()

    ground_truth_obj = None
    ground_truth_dict: dict[str, Any] | None = None
    if not scenario.get("skip_ground_truth"):
        ground_truth_obj = await ground_truth_for_question(
            question=question,
            user_id=user_id,
            timezone=timezone,
            now=now,
        )
        if ground_truth_obj is not None:
            ground_truth_dict = ground_truth_obj.values
            ground_truth_dict["_sql_notes"] = ground_truth_obj.sql_notes

    try:
        response = await service.chat(
            user_id=user_id,
            user_jwt="smoke-test-jwt",
            body=ChatRequest(content=question, timezone=timezone),
        )
        error = None
    except Exception as exc:
        duration_ms = int((time.perf_counter() - started) * 1000)
        return {
            "id": scenario["id"],
            "question": question,
            "passed": False,
            "duration_ms": duration_ms,
            "error": f"{type(exc).__name__}: {exc}",
            "answer": None,
            "blocks": [],
            "deep_link": None,
            "ground_truth": ground_truth_dict,
            "checks": [{"check": "agent_invoke", "ok": False}],
        }

    duration_ms = int((time.perf_counter() - started) * 1000)
    result = verify_response(
        scenario_id=scenario["id"],
        question=question,
        answer=response.answer,
        blocks=response.blocks,
        deep_link=response.deep_link,
        ground_truth=ground_truth_dict,
        expect_clarification=bool(scenario.get("expect_clarification")),
        expect_chart=scenario.get("expect_chart"),
        chart_required=bool(scenario.get("chart_required", True)),
        expect_deep_link=bool(scenario.get("expect_deep_link")),
        expect_payee_id=scenario.get("expect_payee_id"),
    )
    result["duration_ms"] = duration_ms
    result["error"] = error
    return result


def _format_report(
    *,
    results: list[dict[str, Any]],
    user_id: str,
    timezone: str,
    ran_at: datetime,
    verification_note: str,
) -> str:
    passed = sum(1 for r in results if r.get("passed"))
    total = len(results)
    lines = [
        "# Agent smoke test results",
        "",
        f"- **Run at:** {ran_at.isoformat()}",
        f"- **User ID:** `{user_id}`",
        f"- **Timezone:** `{timezone}`",
        f"- **Summary:** {passed}/{total} passed",
        f"- **Ground truth:** {verification_note}",
        "",
        "## Summary",
        "",
        "| ID | Pass | Duration | Question |",
        "|----|------|----------|----------|",
    ]
    for r in results:
        mark = "PASS" if r.get("passed") else "FAIL"
        q = r["question"].replace("|", "\\|")
        lines.append(
            f"| {r['id']} | {mark} | {r.get('duration_ms', '?')}ms | {q} |"
        )

    lines.extend(["", "## Details", ""])
    for r in results:
        status = "PASS" if r.get("passed") else "FAIL"
        lines.append(f"### {r['id']} — {status}")
        lines.append("")
        lines.append(f"**Question:** {r['question']}")
        lines.append("")
        if r.get("error"):
            lines.append(f"**Error:** `{r['error']}`")
            lines.append("")
        if r.get("ground_truth"):
            lines.append("**Ground truth (Supabase/RLS SQL):**")
            lines.append("```json")
            lines.append(json.dumps(r["ground_truth"], indent=2, default=str))
            lines.append("```")
            lines.append("")
        lines.append("**Agent answer:**")
        lines.append("")
        lines.append(r.get("answer") or "_(no answer)_")
        lines.append("")
        if r.get("blocks"):
            lines.append("**Blocks:**")
            lines.append("```json")
            lines.append(json.dumps(r["blocks"], indent=2, default=str)[:4000])
            lines.append("```")
            lines.append("")
        if r.get("deep_link"):
            lines.append("**Deep link:**")
            lines.append("```json")
            lines.append(json.dumps(r["deep_link"], indent=2, default=str))
            lines.append("```")
            lines.append("")
        lines.append("**Checks:**")
        for check in r.get("checks") or []:
            ok = "ok" if check.get("ok") else "FAIL"
            detail = {k: v for k, v in check.items() if k != "ok"}
            lines.append(f"- `{check.get('check')}`: **{ok}** — `{detail}`")
        lines.append("")

    return "\n".join(lines)


async def main() -> int:
    user_id = os.environ.get("AGENT_SMOKE_USER_ID", DEFAULT_USER)
    timezone = os.environ.get("AGENT_SMOKE_TIMEZONE", DEFAULT_TZ)
    _, now = _local_now(timezone, None)

    verification_note = (
        "Postgres via `execute_readonly_sql` (same RLS as agent). "
        "Supabase MCP was not connected in the runner environment."
    )

    print(f"Agent smoke test — user={user_id} tz={timezone}")
    await init_sql_pool()

    service = AgentService()
    results: list[dict[str, Any]] = []

    try:
        for scenario in SCENARIOS:
            print(f"  -> {scenario['id']}: {scenario['question'][:60]}...")
            result = await _run_scenario(
                service,
                user_id=user_id,
                timezone=timezone,
                now=now,
                scenario=scenario,
            )
            results.append(result)
            mark = "PASS" if result.get("passed") else "FAIL"
            print(f"     {mark} ({result.get('duration_ms')}ms)")
    finally:
        await close_sql_pool()

    report = _format_report(
        results=results,
        user_id=user_id,
        timezone=timezone,
        ran_at=now,
        verification_note=verification_note,
    )
    out_path = _report_path()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(report, encoding="utf-8")
    print(f"\nReport written to {out_path}")

    passed = sum(1 for r in results if r.get("passed"))
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
