"""OpenRouter model gateway for every AI call in the engine."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from collections import OrderedDict
from typing import Any, Dict, List, Optional

from langchain_openai import ChatOpenAI
from openai import OpenAI

from app.core.config import settings
from app.services.openrouter_limits import (
    call_with_429_retry,
    is_rate_limit_error,
    is_transient_openrouter_error,
    retry_after_seconds,
    wait_for_openrouter_slot,
)

logger = logging.getLogger(__name__)
_EMBED_CACHE: OrderedDict[str, List[float]] = OrderedDict()
_EMBED_CACHE_MAX = 512


class GatedChatOpenAI(ChatOpenAI):
    """ChatOpenAI that shares the process-wide OpenRouter free-tier gate."""

    def _chat_model_id(self) -> str:
        return str(getattr(self, "model", None) or getattr(self, "model_name", "") or "")

    def _generate(self, *args, **kwargs):
        model_id = self._chat_model_id()
        return call_with_429_retry(
            lambda: super(GatedChatOpenAI, self)._generate(*args, **kwargs),
            model=model_id,
        )

    async def _agenerate(self, *args, **kwargs):
        model_id = self._chat_model_id()
        attempts = max(0, int(settings.OPENROUTER_429_MAX_RETRIES)) + 1
        last: Exception | None = None
        for attempt in range(attempts):
            await asyncio.to_thread(wait_for_openrouter_slot, model_id)
            try:
                return await super()._agenerate(*args, **kwargs)
            except Exception as exc:
                last = exc
                if not is_transient_openrouter_error(exc) or attempt == attempts - 1:
                    raise
                if is_rate_limit_error(exc):
                    await asyncio.sleep(retry_after_seconds(exc))
                else:
                    await asyncio.sleep(min(8.0, 2.0 * (attempt + 1)))
        raise last  # pragma: no cover


def openrouter_api_key() -> str:
    """Return the OpenRouter key, or a placeholder so clients can construct."""
    key = (settings.OPENROUTER_API_KEY or "").strip()
    return key or "not-configured"


def resolve_default_model(model: str | None = None) -> str:
    """Explicit model when provided (and configured), otherwise the default."""
    chosen = (model or "").strip()
    return chosen or settings.DEFAULT_MODEL


class ModelService:
    """LLM and embedding calls go through OpenRouter only."""

    def __init__(self, model: Optional[str] = None):
        self.default_model = settings.DEFAULT_MODEL
        self.embedding_model_name = settings.EMBEDDING_MODEL
        self.model = self.resolve_model(model)
        if openrouter_api_key() == "not-configured":
            logger.warning(
                "OPENROUTER_API_KEY is not set; configure it before running generation jobs"
            )
        self.client = OpenAI(
            base_url=settings.OPENROUTER_BASE_URL,
            api_key=openrouter_api_key(),
            timeout=float(settings.OPENROUTER_TIMEOUT_SECONDS),
            max_retries=2,
            default_headers={
                "HTTP-Referer": "https://cadensend.app",
                "X-Title": "Cadensend",
            },
        )

    def resolve_model(self, model: Optional[str] = None) -> str:
        """Use an explicit model when provided, otherwise the ENV default."""
        chosen = (model or "").strip()
        return chosen or self.default_model

    def get_chat_model(
        self,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000,
    ) -> ChatOpenAI:
        """LangChain chat model pointed at OpenRouter."""
        return GatedChatOpenAI(
            base_url=settings.OPENROUTER_BASE_URL,
            api_key=openrouter_api_key(),
            model=self.resolve_model(model),
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=float(settings.OPENROUTER_TIMEOUT_SECONDS),
            max_retries=2,
        )

    def generate_text(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000,
    ) -> str:
        """Synchronous chat completion via OpenRouter."""
        model_id = self.resolve_model(model)
        start_time = time.time()
        response = call_with_429_retry(
            lambda: self.client.chat.completions.create(
                model=model_id,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            ),
            model=model_id,
        )
        result = response.choices[0].message.content or ""
        logger.info("Generated response in %.2fs using %s", time.time() - start_time, model_id)
        return result

    async def generate_response(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000,
    ) -> str:
        """Generate a chat completion from the configured OpenRouter model."""
        try:
            return await asyncio.to_thread(
                self.generate_text,
                messages,
                model,
                temperature,
                max_tokens,
            )
        except Exception as e:
            logger.error("Failed to generate response: %s", e)
            raise

    async def generate_structured_output(
        self,
        messages: List[Dict[str, str]],
        schema: Dict[str, Any],
        model: Optional[str] = None,
        max_retries: int = 1,
        temperature: float = 0.1,
        max_tokens: int = 4000,
    ) -> Dict[str, Any]:
        """Generate structured JSON output from the LLM."""
        model_id = self.resolve_model(model)
        last_error: Optional[Exception] = None

        for attempt in range(max_retries + 1):
            try:
                response = await asyncio.to_thread(
                    call_with_429_retry,
                    lambda: self.client.chat.completions.create(
                        model=model_id,
                        messages=messages + [
                            {
                                "role": "user",
                                "content": f"Output valid JSON matching this schema: {json.dumps(schema)}",
                            }
                        ],
                        temperature=temperature,
                        max_tokens=max_tokens,
                        response_format={"type": "json_object"},
                    ),
                    model_id,
                )
                result = response.choices[0].message.content
                parsed = json.loads(result)
                logger.debug("Generated structured output (attempt %d) using %s", attempt + 1, model_id)
                return parsed
            except Exception as e:
                last_error = e
                logger.warning("Attempt %d failed: %s", attempt + 1, e)
                if attempt < max_retries:
                    continue

        raise last_error

    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Embed texts with the OpenRouter embedding model, with an in-process cache."""
        keys = [
            hashlib.sha256(f"{self.embedding_model_name}\0{text}".encode("utf-8")).hexdigest()
            for text in texts
        ]
        results: List[List[float] | None] = [None] * len(texts)
        missing_indexes: List[int] = []
        for index, key in enumerate(keys):
            cached = _EMBED_CACHE.get(key)
            if cached is not None:
                _EMBED_CACHE.move_to_end(key)
                results[index] = cached
            else:
                missing_indexes.append(index)

        if missing_indexes:
            to_embed = [texts[i] for i in missing_indexes]
            try:
                response = call_with_429_retry(
                    lambda: self.client.embeddings.create(
                        model=self.embedding_model_name,
                        input=to_embed,
                        encoding_format="float",
                    )
                )
                ordered = sorted(response.data, key=lambda item: item.index)
                for local_i, item in enumerate(ordered):
                    original_index = missing_indexes[local_i]
                    vector = item.embedding
                    results[original_index] = vector
                    cache_key = keys[original_index]
                    _EMBED_CACHE[cache_key] = vector
                    _EMBED_CACHE.move_to_end(cache_key)
                    while len(_EMBED_CACHE) > _EMBED_CACHE_MAX:
                        _EMBED_CACHE.popitem(last=False)
                logger.debug(
                    "Generated %d embeddings (%d cached) with %s",
                    len(to_embed),
                    len(texts) - len(to_embed),
                    self.embedding_model_name,
                )
            except Exception as e:
                logger.error("Failed to generate embeddings: %s", e)
                raise

        return [vector or [] for vector in results]

    def list_chat_models(self) -> Dict[str, Any]:
        """List OpenRouter chat models; default is always first."""
        models = [
            {
                "id": self.default_model,
                "name": f"Default ({self.default_model})",
                "is_default": True,
            }
        ]
        seen = {self.default_model}
        try:
            listed = self.client.models.list()
            extras = []
            for item in listed.data:
                model_id = item.id
                if not model_id or model_id in seen:
                    continue
                if "embed" in model_id.lower():
                    continue
                extras.append(
                    {
                        "id": model_id,
                        "name": getattr(item, "name", None) or model_id,
                        "is_default": False,
                    }
                )
                seen.add(model_id)
            extras.sort(key=lambda m: (0 if m["id"].endswith(":free") else 1, m["id"]))
            models.extend(extras)
        except Exception as e:
            logger.warning("Could not list OpenRouter models: %s", e)

        return {
            "default_model": self.default_model,
            "embedding_model": self.embedding_model_name,
            "models": models,
        }
