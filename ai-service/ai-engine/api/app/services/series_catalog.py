"""Postgres reads the agent needs: series, sources, prior issues."""

from __future__ import annotations

import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

import asyncpg

from app.core.config import settings


def postgres_dsn(url: str | None = None) -> str:
    raw = url or settings.DATABASE_URL
    return raw.replace("postgresql+asyncpg://", "postgresql://").replace("postgres://", "postgresql://")


def _run(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


def _as_str(value: Any) -> str:
    return "" if value is None else str(value)


def _plan_json(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


class PostgresSeriesCatalog:
    """Tenant-scoped series/source/issue lookups for agent tools."""

    def get_series(self, series_id: str, workspace_id: str) -> Optional[Dict[str, Any]]:
        if not series_id or not workspace_id:
            return None
        return _run(self._aget_series(series_id, workspace_id))

    def list_sources(self, series_id: str, workspace_id: str, limit: int) -> List[Dict[str, Any]]:
        if not series_id or not workspace_id:
            return []
        return _run(self._alist_sources(series_id, workspace_id, max(1, limit)))

    def list_issues(self, series_id: str, limit: int) -> List[Dict[str, Any]]:
        if not series_id:
            return []
        return _run(self._alist_issues(series_id, max(1, limit)))

    async def _aget_series(self, series_id: str, workspace_id: str) -> Optional[Dict[str, Any]]:
        conn = await asyncpg.connect(postgres_dsn())
        try:
            row = await conn.fetchrow(
                """
                SELECT id, workspace_id, topic, goal, level, timezone, status,
                       cadence, start_date, send_time, send_days, plan_status, plan_json
                FROM series
                WHERE id = $1::uuid AND workspace_id = $2::uuid AND deleted_at IS NULL
                """,
                series_id,
                workspace_id,
            )
        finally:
            await conn.close()
        if row is None:
            return None
        return {
            "id": _as_str(row["id"]),
            "workspace_id": _as_str(row["workspace_id"]),
            "topic": row["topic"] or "",
            "goal": row["goal"] or "",
            "level": row["level"] or "",
            "timezone": row["timezone"] or "UTC",
            "status": row["status"] or "",
            "cadence": row["cadence"] or "",
            "start_date": row["start_date"] or "",
            "send_time": row["send_time"] or "",
            "send_days": row["send_days"] or "",
            "plan_status": row["plan_status"] or "",
            "plan_json": _plan_json(row["plan_json"]),
        }

    async def _alist_sources(
        self, series_id: str, workspace_id: str, limit: int
    ) -> List[Dict[str, Any]]:
        conn = await asyncpg.connect(postgres_dsn())
        try:
            rows = await conn.fetch(
                """
                SELECT id, type, url, status, ingest_error
                FROM sources
                WHERE series_id = $1::uuid
                  AND workspace_id = $2::uuid
                  AND deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT $3
                """,
                series_id,
                workspace_id,
                limit,
            )
        finally:
            await conn.close()
        return [
            {
                "id": _as_str(row["id"]),
                "title": row["url"] or _as_str(row["id"]),
                "type": row["type"] or "",
                "status": row["status"] or "",
                "ingest_error": row["ingest_error"] or "",
            }
            for row in rows
        ]

    async def _alist_issues(self, series_id: str, limit: int) -> List[Dict[str, Any]]:
        conn = await asyncpg.connect(postgres_dsn())
        try:
            rows = await conn.fetch(
                """
                SELECT id, sequence_no, objective, status, scheduled_at
                FROM issues
                WHERE series_id = $1::uuid AND deleted_at IS NULL
                ORDER BY sequence_no ASC
                LIMIT $2
                """,
                series_id,
                limit,
            )
        finally:
            await conn.close()
        out = []
        for row in rows:
            scheduled = row["scheduled_at"]
            out.append(
                {
                    "id": _as_str(row["id"]),
                    "sequence_no": int(row["sequence_no"] or 0),
                    "objective": row["objective"] or "",
                    "status": row["status"] or "",
                    "scheduled_at": scheduled.isoformat() if scheduled else "",
                }
            )
        return out
