"""Must-have Cadensend agent tools: series state, sources, history, scoped retrieve."""

from unittest.mock import Mock

from app.services.agent_tools import NewsletterTools
from app.services.graph_policy import coverage_report
from app.services.react_tools import build_react_tools


class FakeCatalog:
    def __init__(self, series=None, sources=None, issues=None):
        self.series = series
        self.sources = sources or []
        self.issues = issues or []

    def get_series(self, series_id: str, workspace_id: str):
        row = self.series
        if not row:
            return None
        if row["id"] != series_id or row["workspace_id"] != workspace_id:
            return None
        return row

    def list_sources(self, series_id: str, workspace_id: str, limit: int):
        return self.sources[:limit]

    def list_issues(self, series_id: str, limit: int):
        return self.issues[:limit]


def _series_row():
    return {
        "id": "s1",
        "workspace_id": "w1",
        "topic": "Introduction to Docker",
        "goal": "Ship a first container",
        "level": "beginner",
        "timezone": "UTC",
        "cadence": "daily",
        "start_date": "2026-08-17",
        "send_time": "14:00",
        "plan_status": "ready",
        "plan_json": {"modules": [{"title": "Images vs containers"}]},
        "status": "active",
    }


def test_react_toolset_includes_must_have_tools():
    names = {tool.name for tool in build_react_tools(NewsletterTools(catalog=FakeCatalog()))}
    assert names == {
        "retrieve_context",
        "search_sources",
        "generate_visual",
        "get_series_context",
        "list_series_sources",
        "get_issue_history",
        "validate_plan",
        "analyze_retrieval_coverage",
        "generate_glossary",
        "generate_examples",
        "generate_analogies",
        "generate_counterexamples",
        "generate_case_study",
        "generate_scenarios",
    }


def test_retrieve_tool_schema_accepts_source_id():
    tools = {tool.name: tool for tool in build_react_tools(NewsletterTools(catalog=FakeCatalog()))}
    schema = tools["retrieve_context"].args_schema.model_json_schema()
    assert "source_id" in schema.get("properties", {})


def test_get_series_context_reads_catalog_not_rag():
    catalog = FakeCatalog(series=_series_row(), sources=[{"id": "src-1", "status": "ready"}])
    box = NewsletterTools(catalog=catalog)
    result = box.get_series_context("s1", "w1")
    assert result["topic"] == "Introduction to Docker"
    assert result["cadence"] == "daily"
    assert result["send_time"] == "14:00"
    assert result["plan"]["modules"][0]["title"] == "Images vs containers"
    assert result["source_count"] == 1
    assert "retrieved_snippets" not in result


def test_get_series_context_missing_series():
    box = NewsletterTools(catalog=FakeCatalog())
    result = box.get_series_context("missing", "w1")
    assert result["found"] is False


def test_list_series_sources_and_issue_history():
    catalog = FakeCatalog(
        series=_series_row(),
        sources=[{"id": "src-1", "title": "Docker docs", "status": "ready", "type": "url"}],
        issues=[
            {"id": "i1", "sequence_no": 1, "objective": "Images vs containers", "status": "ready"},
            {"id": "i2", "sequence_no": 2, "objective": "Volumes", "status": "generating"},
        ],
    )
    box = NewsletterTools(catalog=catalog)
    sources = box.list_series_sources("s1", "w1")
    history = box.get_issue_history("s1", "w1")
    assert sources["sources"][0]["id"] == "src-1"
    assert history["issues"][0]["objective"] == "Images vs containers"
    assert history["count"] == 2


def test_retrieve_context_passes_source_id():
    retrieval = Mock()
    retrieval.retrieve.return_value = [
        {
            "score": 0.9,
            "payload": {
                "text_preview": "A container is a running image.",
                "source_id": "src-1",
                "chunk_id": "c1",
                "section_path": ["Intro"],
            },
        }
    ]
    models = Mock()
    models.get_embeddings.return_value = [[0.1, 0.2]]
    box = NewsletterTools(model_service=models, catalog=FakeCatalog())
    box._retrieval = retrieval
    hits = box.retrieve_context("container", "w1", series_id="s1", source_id="src-1", top_k=3)
    kwargs = retrieval.retrieve.call_args.kwargs
    assert kwargs["source_id"] == "src-1"
    assert kwargs["series_id"] == "s1"
    assert kwargs["top_k"] == 3
    assert hits[0]["source_id"] == "src-1"


def test_coverage_report_marks_empty_corpus_ungrounded():
    report = coverage_report([], min_score=0.25)
    assert report["grounded"] is False
    assert report["reason"] == "no_matches"
    assert report["coverage_score"] == 0.0


def test_coverage_report_requires_min_score():
    weak = coverage_report([{"score": 0.1, "source_id": "s"}], min_score=0.25)
    strong = coverage_report([{"score": 0.8, "source_id": "s"}], min_score=0.25)
    assert weak["grounded"] is False
    assert strong["grounded"] is True


def test_learning_aid_tools_return_structured_json():
    models = Mock()
    models.generate_text.return_value = (
        '{"examples":[{"title":"Example 1","example":"A concrete case.","why_it_helps":"It grounds the idea."},'
        '{"title":"Example 2","example":"Another case.","why_it_helps":"It broadens the concept."}]}'
    )
    box = NewsletterTools(model_service=models, catalog=FakeCatalog())
    result = box.generate_examples("vector databases", audience_level="beginner", count=1)
    assert result["examples"][0]["title"] == "Example 1"
    assert len(result["examples"]) == 1
    prompt = models.generate_text.call_args.args[0][1]["content"]
    assert "Task: generate examples." in prompt
    assert "vector databases" in prompt
