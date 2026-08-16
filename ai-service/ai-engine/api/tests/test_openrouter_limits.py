"""Tests for OpenRouter free-tier pacing."""

import time

from app.services.openrouter_limits import (
    is_rate_limit_error,
    is_transient_openrouter_error,
    retry_after_seconds,
    uses_free_tier_pacing,
    wait_for_openrouter_slot,
)


class Fake429(Exception):
    def __init__(self, message, status_code=429, headers=None):
        super().__init__(message)
        self.status_code = status_code
        self.response = type("Resp", (), {"headers": headers or {}})()


def test_detects_openrouter_rate_limit_message():
    err = Exception(
        "Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-min. '}}"
    )
    assert is_rate_limit_error(err)


def test_retry_waits_for_reset_header():
    now = 1_000_000.0
    err = Fake429(
        "Rate limit exceeded",
        headers={"X-RateLimit-Reset": str(int((now + 40) * 1000))},
    )
    wait = retry_after_seconds(err, now=now)
    assert 35 <= wait <= 45


def test_retry_parses_reset_from_error_text():
    now = 1_000_000.0
    reset_ms = int((now + 25) * 1000)
    err = Exception(
        "Error code: 429 - {'error': {'metadata': {'headers': {'X-RateLimit-Reset': '%s'}}}}"
        % reset_ms
    )
    wait = retry_after_seconds(err, now=now)
    assert 20 <= wait <= 30


def test_free_and_default_models_use_pacing(monkeypatch):
    monkeypatch.setattr(
        "app.services.openrouter_limits.settings.DEFAULT_MODEL",
        "poolside/laguna-s-2.1:free",
    )
    assert uses_free_tier_pacing("")
    assert uses_free_tier_pacing("poolside/laguna-s-2.1:free")
    assert uses_free_tier_pacing("google/gemini-2.0-flash-exp:free")
    assert not uses_free_tier_pacing("anthropic/claude-3.5-sonnet")
    assert not uses_free_tier_pacing("openai/gpt-4o")


def test_paid_model_skips_slot_wait(monkeypatch):
    monkeypatch.setattr("app.services.openrouter_limits.settings.OPENROUTER_MIN_INTERVAL_SECONDS", 30)
    started = time.monotonic()
    wait_for_openrouter_slot("anthropic/claude-3.5-sonnet")
    assert time.monotonic() - started < 1


def test_connection_error_is_transient():
    assert is_transient_openrouter_error(Exception("Connection error."))
    assert not is_transient_openrouter_error(Exception("invalid api key"))
