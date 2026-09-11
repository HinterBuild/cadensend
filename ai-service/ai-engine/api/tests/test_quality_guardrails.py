"""Tests for generation-time quality guardrails."""

from app.platform.editorial.tools import EvaluationHarness
from app.services.quality_guardrails import assess_issue_quality


def _issue(**overrides):
    base = {
        "subject": "Paged attention in vLLM",
        "preheader": "KV cache paging",
        "content_blocks": [
            {
                "title": "Why paging",
                "text": "vLLM pages KV blocks for throughput.",
                "citations": [{"source_id": "src-1", "chunk_id": "c1", "text": "paging"}],
            },
            {
                "title": "Takeaway",
                "text": "Use continuous batching with paging for stable latency.",
                "citations": [],
            },
        ],
    }
    base.update(overrides)
    return base


class TestEvaluationHarness:
    def test_flags_banned_phrases(self):
        harness = EvaluationHarness()
        issue = _issue()
        issue["content_blocks"][0]["text"] = "This synergy will disrupt the market."
        result = harness.evaluate(issue, banned_phrases=["synergy", "disrupt"])
        assert result["passed"] is False
        assert "synergy" in result["banned_hits"]

    def test_requires_grounding_when_sources_expected(self):
        harness = EvaluationHarness()
        issue = _issue()
        issue["content_blocks"][0]["citations"] = []
        result = harness.evaluate(issue, require_grounding=True)
        assert result["passed"] is False


class TestAssessIssueQuality:
    def test_passes_grounded_issue(self):
        result = assess_issue_quality(
            _issue(),
            [{"source_id": "src-1", "score": 0.8, "content": "paging"}],
        )
        assert result["needs_revision"] is False

    def test_flags_missing_citations_with_context(self):
        issue = _issue()
        issue["content_blocks"][0]["citations"] = []
        result = assess_issue_quality(
            issue,
            [{"source_id": "src-1", "score": 0.8, "content": "paging"}],
        )
        assert result["needs_revision"] is True
        assert "missing_citations" in result["reasons"]
