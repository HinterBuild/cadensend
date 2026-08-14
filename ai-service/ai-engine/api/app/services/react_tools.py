"""ReAct tools: the model calls these; tenant ids come from graph state, not the model."""

from __future__ import annotations

import json
from typing import Annotated, Any, Dict, List, Optional

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from app.services.agent_tools import NewsletterTools

MAX_QUERY_CHARS = 500
MAX_TOP_K = 8
MAX_TOOL_RESULT_CHARS = 8000


def _clip(payload: Any) -> str:
    text = payload if isinstance(payload, str) else json.dumps(payload)
    if len(text) <= MAX_TOOL_RESULT_CHARS:
        return text
    return text[: MAX_TOOL_RESULT_CHARS - 3] + "..."


def _workspace(state: Dict[str, Any]) -> tuple[str, Optional[str]]:
    return str(state.get("workspace_id") or ""), state.get("series_id")


def build_react_tools(toolbox: NewsletterTools) -> List:
    """Tools the LLM may call. workspace_id/series_id are injected from state."""

    @tool
    def retrieve_context(
        query: str,
        state: Annotated[dict, InjectedState],
        top_k: int = 5,
    ) -> str:
        """Search ingested sources for grounded snippets. Use before stating facts."""
        workspace_id, series_id = _workspace(state)
        hits = toolbox.retrieve_context(
            query=(query or "")[:MAX_QUERY_CHARS],
            workspace_id=workspace_id,
            series_id=series_id,
            top_k=max(1, min(int(top_k or 5), MAX_TOP_K)),
        )
        return _clip(hits)

    @tool
    def search_sources(
        query: str,
        state: Annotated[dict, InjectedState],
        top_k: int = 5,
    ) -> str:
        """Find which sources match a query (ids, titles, short preview)."""
        workspace_id, series_id = _workspace(state)
        hits = toolbox.search_sources(
            query=(query or "")[:MAX_QUERY_CHARS],
            workspace_id=workspace_id,
            series_id=series_id,
            top_k=max(1, min(int(top_k or 5), MAX_TOP_K)),
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
        """Load series-scoped retrieval snippets already tied to this series."""
        workspace_id, series_id = _workspace(state)
        result = toolbox.get_series_context(str(series_id or ""), workspace_id)
        return _clip(result)

    @tool
    def validate_plan(plan: Dict[str, Any], state: Annotated[dict, InjectedState]) -> str:
        """Check a curriculum plan for placeholder titles and missing objectives."""
        _, series_id = _workspace(state)
        result = toolbox.validate_plan(plan or {}, str(series_id or ""))
        return _clip(result)

    @tool
    def estimate_generation_cost(
        plan: Dict[str, Any],
        source_count: int = 1,
    ) -> str:
        """Rough token/cost estimate for generating the plan's issues."""
        result = toolbox.estimate_generation_cost(plan or {}, max(0, int(source_count)))
        return _clip(result)

    @tool
    def analyze_retrieval_coverage(
        query: str,
        state: Annotated[dict, InjectedState],
    ) -> str:
        """Score how well retrieval covers a query for this series."""
        workspace_id, series_id = _workspace(state)
        result = toolbox.analyze_retrieval_coverage(
            query=(query or "")[:MAX_QUERY_CHARS],
            workspace_id=workspace_id,
            series_id=series_id,
            top_k=MAX_TOP_K,
        )
        return _clip(result)

    return [
        retrieve_context,
        search_sources,
        generate_visual,
        get_series_context,
        validate_plan,
        estimate_generation_cost,
        analyze_retrieval_coverage,
    ]
