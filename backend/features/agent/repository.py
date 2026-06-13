"""agent_threads / agent_messages persistence (service role + user_id checks)."""

from __future__ import annotations

from typing import Any

from supabase import Client


class AgentRepository:
    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    def list_threads(self, user_id: str, *, limit: int = 50) -> list[dict[str, Any]]:
        res = (
            self._db.table("agent_threads")
            .select("id,title,created_at,updated_at")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        )
        data = res.data
        return [r for r in data if isinstance(r, dict)] if isinstance(data, list) else []

    def create_thread(self, user_id: str, *, title: str = "") -> dict[str, Any]:
        res = (
            self._db.table("agent_threads")
            .insert({"user_id": user_id, "title": title})
            .execute()
        )
        row = res.data[0] if isinstance(res.data, list) and res.data else None
        if not isinstance(row, dict):
            msg = "Failed to create agent thread"
            raise RuntimeError(msg)
        return row

    def get_thread(self, user_id: str, thread_id: str) -> dict[str, Any] | None:
        res = (
            self._db.table("agent_threads")
            .select("id,user_id,title,created_at,updated_at")
            .eq("id", thread_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        return res.data if isinstance(res.data, dict) else None

    def delete_thread(self, user_id: str, thread_id: str) -> None:
        self._db.table("agent_threads").delete().eq("id", thread_id).eq(
            "user_id", user_id
        ).execute()

    def list_messages(
        self,
        thread_id: str,
        *,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        res = (
            self._db.table("agent_messages")
            .select(
                "id,thread_id,role,content,blocks_json,deep_link_json,created_at"
            )
            .eq("thread_id", thread_id)
            .order("created_at", desc=False)
            .range(offset, offset + limit - 1)
            .execute()
        )
        data = res.data
        return [r for r in data if isinstance(r, dict)] if isinstance(data, list) else []

    def insert_message(
        self,
        *,
        thread_id: str,
        role: str,
        content: str,
        blocks_json: list[dict[str, Any]] | None = None,
        deep_link_json: dict[str, Any] | None = None,
        tool_calls_json: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "thread_id": thread_id,
            "role": role,
            "content": content,
        }
        if blocks_json is not None:
            payload["blocks_json"] = blocks_json
        if deep_link_json is not None:
            payload["deep_link_json"] = deep_link_json
        if tool_calls_json is not None:
            payload["tool_calls_json"] = tool_calls_json

        res = self._db.table("agent_messages").insert(payload).execute()
        row = res.data[0] if isinstance(res.data, list) and res.data else None
        if not isinstance(row, dict):
            msg = "Failed to insert agent message"
            raise RuntimeError(msg)
        return row

    def update_thread_title(self, user_id: str, thread_id: str, title: str) -> None:
        self._db.table("agent_threads").update({"title": title}).eq(
            "id", thread_id
        ).eq("user_id", user_id).execute()
