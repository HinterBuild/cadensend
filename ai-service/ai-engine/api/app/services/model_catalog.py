from typing import List, Dict, Any, Optional
import httpx
import logging

from app.core.config import settings
from app.platform.llms import LLMRegistry, ProviderConfig

logger = logging.getLogger(__name__)


class ModelCatalogService:
    """Service for tracking and managing available LLM models across providers."""

    def __init__(self):
        self._cache: Dict[str, List[Dict[str, Any]]] = {}
        self._cache_ttl = 300

    def fetch_available_models(self, provider: str) -> List[Dict[str, Any]]:
        """Fetch models from a provider API, caching the result."""
        import time

        cache_key = f"models:{provider}"
        now = time.time()

        if cache_key in self._cache:
            cached = self._cache[cache_key]
            if isinstance(cached, dict) and cached.get("_timestamp", 0) > now - self._cache_ttl:
                return cached["models"]

        try:
            if provider == "openrouter":
                models = self._fetch_openrouter_models()
            elif provider == "openai":
                models = self._fetch_openai_models()
            elif provider == "anthropic":
                models = self._fetch_anthropic_models()
            elif provider == "gemini":
                models = self._fetch_gemini_models()
            elif provider == "xai":
                models = self._fetch_xai_models()
            elif provider == "qwen":
                models = self._fetch_qwen_models()
            elif provider == "local":
                models = self._fetch_local_models()
            else:
                models = LLMRegistry.get_model_info(provider)
                if isinstance(models, dict):
                    models = [models]
                else:
                    models = []

            self._cache[cache_key] = {"models": models, "_timestamp": now}
            return models
        except Exception as e:
            logger.warning("Failed to fetch models for %s: %s", provider, e)
            return self._get_fallback_models(provider)

    def _fetch_openrouter_models(self) -> List[Dict[str, Any]]:
        api_key = settings.OPENROUTER_API_KEY
        if not api_key:
            return self._get_fallback_models("openrouter")

        url = f"{settings.OPENROUTER_BASE_URL}/models"
        response = httpx.get(url, headers={"Authorization": f"Bearer {api_key}"})
        response.raise_for_status()
        data = response.json()

        models = []
        for item in data.get("data", []):
            model_id = item.get("id", "")
            if "embed" in model_id.lower():
                continue
            models.append({
                "id": model_id,
                "name": item.get("name", model_id),
                "description": item.get("description", ""),
                "context_length": item.get("context_length", 4096),
                "pricing": item.get("pricing", {}),
            })
        return models

    def _fetch_openai_models(self) -> List[Dict[str, Any]]:
        api_key = settings.OPENAI_API_KEY
        if not api_key:
            return self._get_fallback_models("openai")

        url = (settings.OPENAI_BASE_URL or "https://api.openai.com/v1") + "/models"
        response = httpx.get(url, headers={"Authorization": f"Bearer {api_key}"})
        response.raise_for_status()
        data = response.json()

        models = []
        for item in data.get("data", []):
            model_id = item.get("id", "")
            models.append({
                "id": model_id,
                "name": item.get("id", model_id),
                "description": "",
            })
        return models

    def _fetch_anthropic_models(self) -> List[Dict[str, Any]]:
        return [
            {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet", "description": "Latest Claude model"},
            {"id": "claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku", "description": "Fast Claude model"},
            {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus", "description": "Most capable Claude model"},
        ]

    def _fetch_gemini_models(self) -> List[Dict[str, Any]]:
        return [
            {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", "description": "Fast multimodal model"},
            {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro", "description": "Large context model"},
        ]

    def _fetch_xai_models(self) -> List[Dict[str, Any]]:
        return [
            {"id": "grok-2-128k", "name": "Grok 2 128K", "description": "xAI reasoning model"},
            {"id": "grok-2-vision-128k", "name": "Grok 2 Vision 128K", "description": "Vision-capable model"},
        ]

    def _fetch_qwen_models(self) -> List[Dict[str, Any]]:
        return [
            {"id": "qwen-turbo", "name": "Qwen Turbo", "description": "Fast Qwen model"},
            {"id": "qwen-plus", "name": "Qwen Plus", "description": "Advanced Qwen model"},
            {"id": "qwen-max", "name": "Qwen Max", "description": "Most capable Qwen model"},
        ]

    def _fetch_local_models(self) -> List[Dict[str, Any]]:
        try:
            url = (settings.LOCAL_BASE_URL or "http://localhost:11434") + "/api/tags"
            response = httpx.get(url)
            data = response.json()

            models = []
            for item in data.get("models", []):
                models.append({
                    "id": item.get("name", ""),
                    "name": item.get("name", ""),
                    "description": item.get("description", ""),
                    "size": item.get("size", 0),
                })
            return models
        except Exception as e:
            logger.warning("Could not fetch local models: %s", e)
            return []

    def _get_fallback_models(self, provider: str) -> List[Dict[str, Any]]:
        fallback = {
            "openrouter": [
                {"id": "poolside/laguna-s-2.1:free", "name": "Laguna S2.1 (Free)", "description": "Default model"},
                {"id": "meta-llama/llama-3-8b-instruct:free", "name": "Llama 3 8B (Free)", "description": "Meta model"},
            ],
            "openai": [
                {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "description": "Fast and affordable"},
                {"id": "gpt-4o", "name": "GPT-4o", "description": "Most capable"},
            ],
            "anthropic": [
                {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet", "description": "Balanced model"},
                {"id": "claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku", "description": "Fast model"},
            ],
            "gemini": [
                {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", "description": "Fast model"},
                {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro", "description": "Powerful model"},
            ],
            "local": [],
            "xai": [
                {"id": "grok-2-128k", "name": "Grok 2 128K", "description": "xAI model"},
            ],
            "qwen": [
                {"id": "qwen-turbo", "name": "Qwen Turbo", "description": "Fast Qwen"},
            ],
        }
        return fallback.get(provider, [])

    def get_workspace_preferred_models(self, workspace_id: str) -> List[Dict[str, Any]]:
        """Get models preferred by workspace owner."""
        from app.db import get_session
        from app.models.workspace import WorkspaceLLMConfig

        with get_session() as session:
            config = session.get(WorkspaceLLMConfig, workspace_id)
            if not config:
                return [{"id": settings.DEFAULT_MODEL, "name": f"Default ({settings.DEFAULT_MODEL})"}]

            default_provider = config.default_provider
            preferred_models = config.configs.get("preferred_models", [])

            if not preferred_models:
                return [{"id": config.default_model or settings.DEFAULT_MODEL, "name": default_provider}]

            return [
                {"id": m, "provider": default_provider, "name": m}
                for m in preferred_models
            ]

    def validate_model_access(self, config: ProviderConfig) -> bool:
        """Check if API key can access this provider."""
        try:
            provider = LLMRegistry.create(config)
            info = provider.get_model_info()
            return bool(info.get("provider"))
        except ValueError as e:
            logger.warning("Model access validation failed: %s", e)
            return False
        except Exception as e:
            logger.warning("Unexpected error during validation: %s", e)
            return False