"""Generation-time quality assessment for plans and issues."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from app.core.config import settings
from app.platform.editorial.studio import DEFAULT_BANNED
from app.platform.editorial.tools import get_evaluation_harness
from app.services.content_structure import (
    analyze_content_structure,
    structure_feedback,
    structure_issue_errors,
)
from app.services.graph_policy import (
    citation_count,
    coverage_report,
    is_stub_issue,
    known_source_ids,
)


def assess_issue_quality(
    issue: Dict[str, Any],
    retrieved_context: Sequence[Dict[str, Any]],
    prior_issues: Optional[List[Dict[str, Any]]] = None,
    banned_phrases: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Return whether an issue should be revised and why."""
    if is_stub_issue(issue):
        return {
            "needs_revision": False,
            "feedback": [],
            "evaluation": None,
            "reasons": [],
            "coverage": None,
        }

    harness = get_evaluation_harness()
    evaluation = harness.evaluate(
        issue,
        prior_issues=prior_issues,
        banned_phrases=banned_phrases or DEFAULT_BANNED,
        require_grounding=bool(known_source_ids(retrieved_context)),
    )

    reasons: List[str] = []
    feedback: List[str] = []
    allowed = known_source_ids(retrieved_context)
    coverage = (
        coverage_report(list(retrieved_context), settings.COVERAGE_MIN_SCORE)
        if retrieved_context
        else None
    )

    if allowed and citation_count(issue) == 0:
        reasons.append("missing_citations")
        feedback.append("Add citations from retrieved sources for factual claims.")

    if coverage and allowed and not coverage.get("grounded"):
        reasons.append("weak_retrieval_coverage")
        feedback.append(
            "Retrieval matches are weak; cite only what you retrieved or soften unsupported claims."
        )

    structure_errors = structure_issue_errors(analyze_content_structure(issue))
    if structure_errors:
        reasons.append("structure_errors")
        feedback.append(structure_feedback(structure_errors))

    if not evaluation.get("passed"):
        reasons.append("evaluation_failed")
        scores = evaluation.get("scores") or {}
        feedback.append(f"Quality below threshold (scores: {scores}).")

    banned_hits = evaluation.get("banned_hits") or []
    if banned_hits:
        reasons.append("banned_phrases")
        feedback.append(f"Remove banned phrases: {', '.join(banned_hits)}.")

    return {
        "needs_revision": bool(reasons),
        "feedback": feedback,
        "evaluation": evaluation,
        "reasons": reasons,
        "coverage": coverage,
    }


def assess_issues_batch(
    issues: List[Dict[str, Any]],
    retrieved_context: Sequence[Dict[str, Any]],
    prior_issues: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Assess all generated issues; revision is required if any fail."""
    assessments = [
        assess_issue_quality(issue, retrieved_context, prior_issues)
        for issue in issues
        if isinstance(issue, dict)
    ]
    needs_revision = any(item["needs_revision"] for item in assessments)
    feedback = []
    for item in assessments:
        feedback.extend(item.get("feedback") or [])
    evaluation = assessments[-1]["evaluation"] if assessments else None
    return {
        "needs_revision": needs_revision,
        "feedback": feedback[:6],
        "evaluation": evaluation,
        "assessments": assessments,
    }
