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
from app.platform.llms import LLMRegistry, ProviderConfig, LLMMessage, register_all_providers
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

register_all_providers()


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


def resolve_provider_config(
    provider: Optional[str],
    model: Optional[str],
    workspace_id: Optional[str] = None,
) -> ProviderConfig:
    """Resolve provider config from workspace settings, falling back to environment."""
    from app.services.workspace_llm import get_workspace_llm_config

    ws = get_workspace_llm_config(workspace_id or "") if workspace_id else None
    if ws:
        provider = (provider or ws.get("provider") or settings.DEFAULT_PROVIDER or "openrouter").strip()
        resolved_model = (model or ws.get("default_model") or settings.DEFAULT_MODEL).strip()
        api_key = (ws.get("api_key") or "").strip() or None
        base_url = (ws.get("base_url") or "").strip() or None
        if api_key or base_url:
            return ProviderConfig(
                provider=provider,
                model=resolved_model,
                api_key=api_key,
                base_url=base_url,
                workspace_id=workspace_id,
            )

    if provider is None:
        provider = settings.DEFAULT_PROVIDER or "openrouter"

    return LLMRegistry._build_config_from_env(provider, model or settings.DEFAULT_MODEL)


def get_chat_model_from_config(
    config: ProviderConfig,
    temperature: float = 0.7,
    max_tokens: int = 4000,
) -> ChatOpenAI:
    """LangChain chat model for OpenAI-compatible providers."""
    base_url = config.base_url
    api_key = config.api_key

    if config.provider == "openrouter":
        base_url = base_url or settings.OPENROUTER_BASE_URL
        api_key = api_key or openrouter_api_key()
        return GatedChatOpenAI(
            base_url=base_url,
            api_key=api_key,
            model=config.model,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=float(settings.OPENROUTER_TIMEOUT_SECONDS),
            max_retries=2,
        )

    if config.provider in {"openai", "local", "xai", "qwen"}:
        defaults = {
            "openai": settings.OPENAI_BASE_URL or "https://api.openai.com/v1",
            "local": settings.LOCAL_BASE_URL or "http://localhost:11434/v1",
            "xai": "https://api.x.ai/v1",
            "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        }
        env_config = LLMRegistry._build_config_from_env(config.provider, config.model)
        return ChatOpenAI(
            base_url=base_url or defaults.get(config.provider),
            api_key=api_key or env_config.api_key or "not-configured",
            model=config.model,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=float(settings.OPENROUTER_TIMEOUT_SECONDS),
            max_retries=2,
        )

    env_config = LLMRegistry._build_config_from_env(config.provider, config.model)
    return GatedChatOpenAI(
        base_url=settings.OPENROUTER_BASE_URL,
        api_key=env_config.api_key or openrouter_api_key(),
        model=config.model,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=float(settings.OPENROUTER_TIMEOUT_SECONDS),
        max_retries=2,
    )


def get_chat_model_for_workspace(
    workspace_id: str,
    model: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 4000,
) -> ChatOpenAI:
    """Chat model using the workspace's configured LLM provider."""
    config = resolve_provider_config(provider=None, model=model, workspace_id=workspace_id)
    return get_chat_model_from_config(config, temperature=temperature, max_tokens=max_tokens)


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


class MultiProviderModelService:
    """LLM service supporting multiple providers: OpenRouter, OpenAI, Anthropic, Gemini, Local, xAI, Qwen."""

    def __init__(self, config: Optional[ProviderConfig] = None):
        self.config = config or self._resolve_config()
        self._provider: Optional[LLMRegistry] = None

    def _resolve_config(self) -> ProviderConfig:
        provider = settings.DEFAULT_PROVIDER or "openrouter"
        model = settings.DEFAULT_MODEL
        api_key = settings.OPENROUTER_API_KEY
        base_url = settings.OPENROUTER_BASE_URL

        if provider == "openai" or "openai" in (api_key or "").lower():
            api_key = settings.OPENAI_API_KEY or api_key
            base_url = settings.OPENAI_BASE_URL or None
        elif provider == "anthropic":
            api_key = settings.ANTHROPIC_API_KEY or api_key
        elif provider == "gemini":
            api_key = settings.GOOGLE_API_KEY or api_key
        elif provider == "xai":
            api_key = settings.XAI_API_KEY or api_key
        elif provider == "qwen":
            api_key = settings.QWEN_API_KEY or api_key
        elif provider == "local":
            base_url = settings.LOCAL_BASE_URL or "http://localhost:11434"

        return ProviderConfig(
            provider=provider,
            api_key=api_key,
            base_url=base_url,
            model=model,
            timeout=settings.OPENROUTER_TIMEOUT_SECONDS,
        )

    @property
    def provider(self) -> Any:
        if self._provider is None:
            self._provider = LLMRegistry.create(self.config)
        return self._provider

    def with_provider(self, provider: str, model: Optional[str] = None, api_key: Optional[str] = None) -> "MultiProviderModelService":
        new_config = ProviderConfig(
            provider=provider,
            api_key=api_key or self.config.api_key,
            base_url=self.config.base_url,
            model=model or self.config.model,
            temperature=self.config.temperature,
            max_tokens=self.config.max_tokens,
            timeout=self.config.timeout,
        )
        return MultiProviderModelService(new_config)

    async def generate(
        self,
        messages: List[LLMMessage],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> str:
        response = await self.provider.generate(messages, temperature=temperature, max_tokens=max_tokens)
        logger.info("Generated response with %s model %s", self.config.provider, self.config.model)
        return response.content

    async def embed(self, text: str) -> List[float]:
        response = await self.provider.embed(text)
        return response.embedding

    def get_model_info(self) -> Dict[str, Any]:
        return self.provider.get_model_info()

    def list_providers(self) -> List[str]:
        return LLMRegistry.list_providers()

    def get_provider_info(self, provider_name: str) -> Dict[str, Any]:
        return LLMRegistry.get_model_info(provider_name)
