"""OpenRouter free-tier pacing: one request at a time, retry 429s."""

from __future__ import annotations

import json
import re
import threading
import time
from contextvars import ContextVar
from typing import Any, Callable, TypeVar

from app.core.config import settings

T = TypeVar("T")

_RESET_MS = re.compile(r"X-RateLimit-Reset['\"]?\s*[:=]\s*['\"]?(\d+)", re.I)
_lock = threading.Lock()
_next_ok = 0.0
_generation_model: ContextVar[str] = ContextVar("openrouter_generation_model", default="")


def set_generation_model(model: str | None):
    return _generation_model.set((model or "").strip())


def reset_generation_model(token) -> None:
    _generation_model.reset(token)


def uses_free_tier_pacing(model: str | None = None) -> bool:
    """Pace only OpenRouter free models (id ends with :free) and the empty/default free model."""
    chosen = (model or "").strip() or _generation_model.get() or settings.DEFAULT_MODEL
    return ":free" in chosen.lower()


def is_rate_limit_error(exc: BaseException) -> bool:
    status = getattr(exc, "status_code", None)
    if status == 429:
        return True
    text = str(exc).lower()
    return "429" in text and "rate limit" in text


def is_transient_openrouter_error(exc: BaseException) -> bool:
    if is_rate_limit_error(exc):
        return True
    text = str(exc).lower()
    return any(
        marker in text
        for marker in (
            "connection error",
            "connecterror",
            "temporarily unavailable",
            "server disconnected",
            "remoteprotocolerror",
        )
    )


def retry_after_seconds(exc: BaseException, now: float | None = None) -> float:
    """Wait until the OpenRouter per-minute window resets, capped for safety."""
    now = time.time() if now is None else now
    reset_ms = _reset_ms(exc)
    if reset_ms:
        wait = reset_ms / 1000.0 - now
        return min(max(wait, 5.0), float(settings.OPENROUTER_429_MAX_WAIT_SECONDS))
    return min(60.0, float(settings.OPENROUTER_429_MAX_WAIT_SECONDS))


def wait_for_openrouter_slot(model: str | None = None) -> None:
    """Space requests so free-tier 20/min is not blown in a burst."""
    if not uses_free_tier_pacing(model):
        return
    global _next_ok
    interval = max(0.0, float(settings.OPENROUTER_MIN_INTERVAL_SECONDS))
    with _lock:
        now = time.monotonic()
        delay = max(0.0, _next_ok - now)
        _next_ok = max(now, _next_ok) + interval
    if delay:
        time.sleep(delay)


def call_with_429_retry(fn: Callable[[], T], model: str | None = None) -> T:
    attempts = max(0, int(settings.OPENROUTER_429_MAX_RETRIES)) + 1
    last: BaseException | None = None
    for attempt in range(attempts):
        wait_for_openrouter_slot(model)
        try:
            return fn()
        except Exception as exc:
            last = exc
            if not is_transient_openrouter_error(exc) or attempt == attempts - 1:
                raise
            if is_rate_limit_error(exc):
                time.sleep(retry_after_seconds(exc))
            else:
                time.sleep(min(8.0, 2.0 * (attempt + 1)))
    raise last  # pragma: no cover


def _reset_ms(exc: BaseException) -> float | None:
    headers = _headers(exc)
    raw = headers.get("X-RateLimit-Reset") or headers.get("x-ratelimit-reset")
    if raw:
        try:
            return float(raw)
        except (TypeError, ValueError):
            pass
    match = _RESET_MS.search(str(exc))
    if match:
        return float(match.group(1))
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        nested = ((body.get("error") or {}).get("metadata") or {}).get("headers") or {}
        raw = nested.get("X-RateLimit-Reset") or nested.get("x-ratelimit-reset")
        if raw:
            try:
                return float(raw)
            except (TypeError, ValueError):
                return None
    try:
        parsed = json.loads(str(exc)[str(exc).find("{") :])
        nested = ((parsed.get("error") or {}).get("metadata") or {}).get("headers") or {}
        raw = nested.get("X-RateLimit-Reset")
        if raw:
            return float(raw)
    except (json.JSONDecodeError, TypeError, ValueError):
        pass
    return None


def _headers(exc: BaseException) -> dict[str, Any]:
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None) if response is not None else None
    if isinstance(headers, dict):
        return headers
    if headers is not None:
        try:
            return dict(headers)
        except Exception:
            return {}
    return {}
