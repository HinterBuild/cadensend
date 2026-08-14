"""Tests for newsletter graph routing and quality policy."""

from app.services.graph_policy import (
    citation_count,
    filter_citations,
    is_stub_issue,
    pick_generated_issue,
    quality_needs_revision,
    route_after_memory,
    route_after_plan,
    should_revise,
)


class TestRouteAfterMemory:
    def test_plan_workflow_goes_to_plan(self):
        assert route_after_memory("plan", None) == "plan"

    def test_issue_workflow_skips_plan(self):
        plan = {"modules": [{"title": "Paged attention"}]}
        assert route_after_memory("issue", plan) == "retrieve"

    def test_issue_without_modules_aborts(self):
        assert route_after_memory("issue", {"modules": []}) == "abort"
        assert route_after_memory("issue", None) == "abort"


class TestRouteAfterPlan:
    def test_failed_plan_does_not_generate(self):
        assert route_after_plan("issue", "planning_failed") == "plan_done"
        assert route_after_plan("plan", "validation_failed") == "plan_done"

    def test_successful_plan_job_stops(self):
        assert route_after_plan("plan", "plan_validated") == "plan_done"

    def test_legacy_issue_after_valid_plan_would_generate(self):
        assert route_after_plan("issue", "plan_validated") == "generate"


class TestRevision:
    def test_revises_when_flagged_under_cap(self):
        assert should_revise(0, 2, True) == "revise"

    def test_stops_at_cap(self):
        assert should_revise(2, 2, True) == "done"

    def test_done_when_quality_ok(self):
        assert should_revise(0, 2, False) == "done"


class TestStubAndCitations:
    def test_detects_welcome_stub(self):
        stub = {
            "subject": "Weekly Issue: Foo",
            "preheader": "Your latest learning content",
            "content_blocks": [{"title": "Welcome", "text": "This is your issue for Foo."}],
        }
        assert is_stub_issue(stub)

    def test_real_issue_is_not_stub(self):
        issue = {
            "subject": "Paged attention in vLLM",
            "preheader": "How KV cache paging works",
            "content_blocks": [{"title": "Why paging", "text": "vLLM pages KV blocks.", "citations": []}],
        }
        assert not is_stub_issue(issue)

    def test_drops_citations_not_in_retrieval(self):
        issue = {
            "subject": "x",
            "preheader": "y",
            "content_blocks": [
                {
                    "text": "fact",
                    "citations": [
                        {"source_id": "real", "chunk_id": "c1", "text": "ok"},
                        {"source_id": "fake", "chunk_id": "c2", "text": "nope"},
                    ],
                }
            ],
        }
        filtered = filter_citations(issue, {"real"})
        assert citation_count(filtered) == 1
        assert filtered["content_blocks"][0]["citations"][0]["source_id"] == "real"

    def test_quality_flags_missing_citations_when_context_exists(self):
        issue = {
            "subject": "Paged attention",
            "preheader": "KV cache",
            "content_blocks": [{"text": "vLLM uses paging.", "citations": []}],
        }
        assert quality_needs_revision([issue], [{"source_id": "src-1"}])

    def test_no_revision_without_retrieval(self):
        issue = {
            "subject": "Intro",
            "preheader": "Start here",
            "content_blocks": [{"text": "Hello", "citations": []}],
        }
        assert not quality_needs_revision([issue], [])

    def test_pick_skips_stubs(self):
        stub = {
            "subject": "Weekly Issue: Foo",
            "preheader": "Your latest learning content",
            "content_blocks": [{"text": "This is your issue for Foo."}],
        }
        real = {
            "subject": "Continuous batching",
            "preheader": "Throughput",
            "content_blocks": [{"text": "Batch requests together."}],
        }
        assert pick_generated_issue([stub, real]) == real
        assert pick_generated_issue([stub]) is None
