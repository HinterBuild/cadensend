"""Tests for live model catalog helpers."""

from app.services.model_catalog import CURATED_MODELS, ModelCatalogService, _is_openai_chat_model


def test_curated_models_include_openrouter_free_tier():
    ids = {m["id"] for m in CURATED_MODELS["openrouter"]}
    assert "poolside/laguna-s-2.1:free" in ids


def test_curated_models_anthropic_latest_family():
    ids = {m["id"] for m in CURATED_MODELS["anthropic"]}
    assert "claude-sonnet-5" in ids


def test_is_openai_chat_model_filters_embeddings():
    assert _is_openai_chat_model("gpt-4o")
    assert not _is_openai_chat_model("text-embedding-3-small")


def test_fallback_models_when_no_api_key():
    svc = ModelCatalogService()
    models = svc._get_fallback_models("qwen")
    assert len(models) >= 2
    assert all("id" in m for m in models)
