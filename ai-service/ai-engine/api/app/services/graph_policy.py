"""Pure routing and quality helpers for the newsletter graph.

Kept free of LangGraph/LLM imports so the pipeline decisions can be unit-tested.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence

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


def pick_generated_issue(issues: List[Any]) -> Optional[Dict[str, Any]]:
    for item in issues:
        if isinstance(item, dict) and not is_stub_issue(item):
            return item
    return None
