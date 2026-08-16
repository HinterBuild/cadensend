"""ReAct tools: the model calls these; tenant ids come from graph state, not the model."""

from __future__ import annotations

import json
from typing import Annotated, Any, Dict, List, Optional

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from app.core.config import settings
from app.services.agent_tools import NewsletterTools


def _clip(payload: Any) -> str:
    text = payload if isinstance(payload, str) else json.dumps(payload)
    limit = settings.MAX_TOOL_RESULT_CHARS
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def _workspace(state: Dict[str, Any]) -> tuple[str, Optional[str]]:
    return str(state.get("workspace_id") or ""), state.get("series_id")


def _top_k(value: int | None) -> int:
    return max(1, min(int(value or 5), settings.MAX_TOOL_TOP_K))


def build_react_tools(toolbox: NewsletterTools) -> List:
    """Tools the LLM may call. workspace_id/series_id are injected from state."""

    @tool
    def retrieve_context(
        query: str,
        state: Annotated[dict, InjectedState],
        top_k: int = 5,
        source_id: str = "",
    ) -> str:
        """Search ingested sources for grounded snippets. Pass source_id to stay inside one document."""
        workspace_id, series_id = _workspace(state)
        hits = toolbox.retrieve_context(
            query=(query or "")[: settings.MAX_QUERY_CHARS],
            workspace_id=workspace_id,
            series_id=series_id,
            source_id=(source_id or "").strip() or None,
            top_k=_top_k(top_k),
        )
        return _clip(hits)

    @tool
    def search_sources(
        query: str,
        state: Annotated[dict, InjectedState],
        top_k: int = 5,
    ) -> str:
        """Find which source chunks match a query (ids, titles, short preview)."""
        workspace_id, series_id = _workspace(state)
        hits = toolbox.search_sources(
            query=(query or "")[: settings.MAX_QUERY_CHARS],
            workspace_id=workspace_id,
            series_id=series_id,
            top_k=_top_k(top_k),
        )
        return _clip(hits)

    @tool
    def generate_visual(
        description: str,
        state: Annotated[dict, InjectedState],
        diagram_type: str = "mermaid",
    ) -> str:
        """Create a Mermaid or D2 diagram spec for the lesson."""
        kind = diagram_type if diagram_type in {"mermaid", "d2"} else "mermaid"
        spec = toolbox.generate_visual(
            description=(description or "")[:1000],
            diagram_type=kind,
        )
        return _clip(spec)

    @tool
    def get_series_context(state: Annotated[dict, InjectedState]) -> str:
        """Load this series topic, cadence, send time, and stored plan from the database."""
        workspace_id, series_id = _workspace(state)
        result = toolbox.get_series_context(str(series_id or ""), workspace_id)
        return _clip(result)

    @tool
    def list_series_sources(state: Annotated[dict, InjectedState]) -> str:
        """List sources attached to this series and whether ingest is ready or failed."""
        workspace_id, series_id = _workspace(state)
        result = toolbox.list_series_sources(str(series_id or ""), workspace_id)
        return _clip(result)

    @tool
    def get_issue_history(state: Annotated[dict, InjectedState]) -> str:
        """List earlier emails in this series so the next lesson does not repeat them."""
        workspace_id, series_id = _workspace(state)
        result = toolbox.get_issue_history(str(series_id or ""), workspace_id)
        return _clip(result)

    @tool
    def validate_plan(plan: Dict[str, Any], state: Annotated[dict, InjectedState]) -> str:
        """Check a curriculum plan for placeholder titles and missing objectives."""
        _, series_id = _workspace(state)
        result = toolbox.validate_plan(plan or {}, str(series_id or ""))
        return _clip(result)

    @tool
    def analyze_retrieval_coverage(
        query: str,
        state: Annotated[dict, InjectedState],
    ) -> str:
        """Score whether ingested sources cover a query. grounded=false means do not invent facts."""
        workspace_id, series_id = _workspace(state)
        result = toolbox.analyze_retrieval_coverage(
            query=(query or "")[: settings.MAX_QUERY_CHARS],
            workspace_id=workspace_id,
            series_id=series_id,
            top_k=settings.MAX_TOOL_TOP_K,
        )
        return _clip(result)

    return [
        retrieve_context,
        search_sources,
        generate_visual,
        get_series_context,
        list_series_sources,
        get_issue_history,
        validate_plan,
        analyze_retrieval_coverage,
    ]
