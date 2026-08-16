"""Agent bounds and retrieval settings the graph/tools must read."""

from app.core.config import Settings


def test_agent_settings_have_safe_defaults():
    cfg = Settings(_env_file=None)
    assert cfg.MAX_TOOL_CALLS == 10
    assert cfg.MAX_REVISION_LOOPS == 2
    assert cfg.MAX_TOOL_TOP_K == 8
    assert cfg.MAX_QUERY_CHARS == 500
    assert cfg.MAX_TOOL_RESULT_CHARS == 8000
    assert cfg.ISSUE_HISTORY_LIMIT == 8
    assert cfg.AGENT_SOURCE_LIST_LIMIT == 20
    assert cfg.COVERAGE_MIN_SCORE == 0.25
    assert cfg.GENERATION_TIMEOUT_SECONDS == 300
    assert cfg.TOP_K_RETRIEVAL >= cfg.MAX_TOOL_TOP_K
