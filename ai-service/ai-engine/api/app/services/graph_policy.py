"""Pure routing and quality helpers for the newsletter graph.

Kept free of LangGraph/LLM imports so the pipeline decisions can be unit-tested.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence
import json

PLAN_FAIL_STATUSES = {"planning_failed", "validation_failed", "failed"}
STUB_PREHEADER = "Your latest learning content"
STUB_BLOCK_PREFIX = "This is your issue for"


def route_after_memory(workflow: str, plan: Optional[Dict[str, Any]]) -> str:
    """Issue jobs skip planning; empty plans abort instead of generating."""
    if workflow == "issue":
        modules = (plan or {}).get("modules") or []
        if not modules:
            return "abort"
        return "retrieve"
    return "plan"


def route_after_plan(workflow: str, status: str) -> str:
    """Stop after a failed plan. Only plan-workflow success stays on the plan path."""
    if status in PLAN_FAIL_STATUSES:
        return "plan_done"
    if workflow == "plan":
        return "plan_done"
    return "generate"


def should_revise(revision_count: int, max_loops: int, needs_revision: bool) -> str:
    if revision_count >= max_loops:
        return "done"
    if needs_revision:
        return "revise"
    return "done"


def is_stub_issue(issue: Any) -> bool:
    if not isinstance(issue, dict):
        return True
    if not str(issue.get("subject") or "").strip():
        return True
    if issue.get("preheader") == STUB_PREHEADER:
        return True
    blocks = issue.get("content_blocks") or []
    if not blocks:
        return True
    first = blocks[0] if isinstance(blocks[0], dict) else {}
    text = str(first.get("text") or "")
    return text.startswith(STUB_BLOCK_PREFIX)


def known_source_ids(context: Sequence[Dict[str, Any]]) -> set[str]:
    return {str(item.get("source_id")) for item in context if item.get("source_id")}


def filter_citations(issue: Dict[str, Any], allowed_ids: Iterable[str]) -> Dict[str, Any]:
    allowed = set(allowed_ids)
    if not allowed:
        return issue
    blocks = []
    for block in issue.get("content_blocks") or []:
        if not isinstance(block, dict):
            blocks.append(block)
            continue
        citations = []
        for citation in block.get("citations") or []:
            if not isinstance(citation, dict):
                continue
            source_id = str(citation.get("source_id") or "")
            if source_id and source_id in allowed:
                citations.append(citation)
        blocks.append({**block, "citations": citations})
    return {**issue, "content_blocks": blocks}


def citation_count(issue: Dict[str, Any]) -> int:
    total = 0
    for block in issue.get("content_blocks") or []:
        if isinstance(block, dict):
            total += len(block.get("citations") or [])
    return total


def quality_needs_revision(
    issues: List[Dict[str, Any]],
    retrieved_context: Sequence[Dict[str, Any]],
) -> bool:
    if not issues or any(is_stub_issue(issue) for issue in issues):
        return False
    allowed = known_source_ids(retrieved_context)
    if not allowed:
        return False
    return any(citation_count(issue) == 0 for issue in issues)


def route_after_agent(last_tool_calls: Any, tool_rounds: int, max_rounds: int) -> str:
    """ReAct router: observe tool calls, cap rounds, then finalize."""
    has_calls = bool(last_tool_calls)
    if has_calls and tool_rounds < max_rounds:
        return "tools"
    if has_calls and tool_rounds >= max_rounds:
        return "force_final"
    return "finalize"


def coverage_report(
    results: Sequence[Dict[str, Any]],
    min_score: float,
) -> Dict[str, Any]:
    """Say whether retrieval is strong enough to ground claims."""
    if not results:
        return {
            "coverage_score": 0.0,
            "grounded": False,
            "reason": "no_matches",
            "total_results": 0,
            "sources_hit": [],
        }
    scores = [float(item.get("score") or 0) for item in results]
    avg = sum(scores) / len(scores)
    sources = sorted({str(item.get("source_id")) for item in results if item.get("source_id")})
    grounded = avg >= min_score and bool(sources)
    return {
        "coverage_score": round(avg, 4),
        "grounded": grounded,
        "reason": "ok" if grounded else "below_min_score",
        "total_results": len(results),
        "sources_hit": sources,
        "avg_score": round(avg, 4),
        "max_score": round(max(scores), 4),
        "min_score": round(min(scores), 4),
    }


def collect_retrieval_hits(messages: Sequence[Any]) -> List[Dict[str, Any]]:
    """Pull RAG payloads out of tool observations."""
    hits: List[Dict[str, Any]] = []
    for message in messages:
        name = getattr(message, "name", "") or ""
        if name not in {"retrieve_context", "search_sources"}:
            continue
        content = getattr(message, "content", "") or ""
        parsed = _parse_tool_json(content)
        if isinstance(parsed, list):
            hits.extend(item for item in parsed if isinstance(item, dict))
        elif isinstance(parsed, dict) and parsed.get("source_id"):
            hits.append(parsed)
    return hits


def _parse_tool_json(content: str) -> Any:
    raw = (content or "").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def pick_generated_issue(issues: List[Any]) -> Optional[Dict[str, Any]]:
    for item in issues:
        if isinstance(item, dict) and not is_stub_issue(item):
            return item
    return None
