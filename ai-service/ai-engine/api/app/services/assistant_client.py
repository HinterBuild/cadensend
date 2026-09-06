"""HTTP client for Cadensend AI tools to call the control API on behalf of the user."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_CLIP = 6000


def _clip(payload: Any) -> str:
    text = payload if isinstance(payload, str) else json.dumps(payload, default=str)
    if len(text) <= _CLIP:
        return text
    return text[: _CLIP - 3] + "..."


class ControlAPIClient:
    def __init__(self, jwt: str, base_url: Optional[str] = None):
        self.jwt = (jwt or "").strip()
        self.base_url = (base_url or settings.CONTROL_API_URL or "http://localhost:8080").rstrip("/")

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.jwt}",
            "Content-Type": "application/json",
        }

    async def request(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> str:
        if not self.jwt:
            return json.dumps({"error": "missing user session"})
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.request(
                    method,
                    url,
                    headers=self._headers(),
                    json=payload,
                )
                body = response.text
                if response.status_code >= 400:
                    try:
                        parsed = response.json()
                        message = parsed.get("error") or parsed.get("detail") or body
                    except Exception:
                        message = body or response.reason_phrase
                    return json.dumps({"error": message, "status": response.status_code})
                return _clip(body)
        except Exception as exc:
            logger.warning("Control API %s %s failed: %s", method, path, exc)
            return json.dumps({"error": str(exc)})

    async def list_series(self) -> str:
        return await self.request("GET", "/v1/series")

    async def get_series(self, series_id: str) -> str:
        return await self.request("GET", f"/v1/series/{series_id}")

    async def list_issues(self, series_id: str) -> str:
        return await self.request("GET", f"/v1/series/{series_id}/issues")

    async def get_issue(self, issue_id: str) -> str:
        return await self.request("GET", f"/v1/issues/{issue_id}")

    async def list_sources(self, series_id: str) -> str:
        return await self.request("GET", f"/v1/series/{series_id}/sources")

    async def get_plan(self, series_id: str) -> str:
        return await self.request("GET", f"/v1/series/{series_id}/plan")

    async def analytics_overview(self) -> str:
        return await self.request("GET", "/v1/analytics/overview")

    async def list_skills(self) -> str:
        return await self.request("GET", "/v1/platform/skills")

    async def list_connectors(self) -> str:
        return await self.request("GET", "/v1/platform/connectors")

    async def list_workflows(self) -> str:
        return await self.request("GET", "/v1/platform/workflows")

    async def search_sources(self, series_id: str, query: str, top_k: int = 5) -> str:
        return await self.request(
            "POST",
            f"/v1/series/{series_id}/retrieval-preview",
            {"query": query, "top_k": top_k},
        )

    async def list_issue_versions(self, issue_id: str) -> str:
        return await self.request("GET", f"/v1/issues/{issue_id}/versions")

    async def evaluate_issue(self, issue: Dict[str, Any], prior_issues: Optional[List[Dict[str, Any]]] = None) -> str:
        return await self.request(
            "POST",
            "/v1/platform/evaluate",
            {"issue": issue, "prior_issues": prior_issues or []},
        )

    async def studio_analyze(self, payload: Dict[str, Any]) -> str:
        return await self.request("POST", "/v1/platform/studio/analyze", payload)

    async def studio_section(self, payload: Dict[str, Any]) -> str:
        return await self.request("POST", "/v1/platform/studio/section", payload)

    async def studio_compose(self, payload: Dict[str, Any]) -> str:
        return await self.request("POST", "/v1/platform/studio/compose", payload)
