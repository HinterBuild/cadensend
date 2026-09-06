"""Workspace-level LLM provider configuration from Postgres."""

from __future__ import annotations

import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, Optional

import asyncpg

from app.core.config import settings
from app.core.database import asyncpg_dsn


def _run(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


def _parse_configs(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


async def _fetch(workspace_id: str) -> Optional[Dict[str, Any]]:
    if not workspace_id:
        return None
    conn = await asyncpg.connect(asyncpg_dsn())
    try:
        row = await conn.fetchrow(
            """
            SELECT default_provider, default_model, embedding_model, configs::text
            FROM workspace_llm_config
            WHERE workspace_id = $1::uuid
            """,
            workspace_id,
        )
    finally:
        await conn.close()

    if not row:
        return None

    configs = _parse_configs(row["configs"])
    provider = (row["default_provider"] or settings.DEFAULT_PROVIDER or "openrouter").strip()
    default_model = (row["default_model"] or settings.DEFAULT_MODEL or "").strip()
    embedding_model = (row["embedding_model"] or settings.EMBEDDING_MODEL or "").strip()

    api_key = ""
    if isinstance(configs.get("api_key"), str):
        api_key = configs["api_key"].strip()
    provider_cfg = configs.get(provider)
    if not api_key and isinstance(provider_cfg, dict):
        api_key = str(provider_cfg.get("api_key") or "").strip()

    base_url = ""
    if isinstance(configs.get("base_url"), str):
        base_url = configs["base_url"].strip()
    if not base_url and isinstance(provider_cfg, dict):
        base_url = str(provider_cfg.get("base_url") or "").strip()

    return {
        "provider": provider,
        "default_model": default_model,
        "embedding_model": embedding_model,
        "configs": configs,
        "api_key": api_key,
        "base_url": base_url,
    }


def get_workspace_llm_config(workspace_id: str) -> Optional[Dict[str, Any]]:
    """Load workspace LLM settings (sync)."""
    return _run(_fetch(workspace_id))
