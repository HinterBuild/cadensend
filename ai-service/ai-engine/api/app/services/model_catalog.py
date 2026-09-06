from typing import List, Dict, Any, Optional
import httpx
import logging

from app.core.config import settings
from app.platform.llms import LLMRegistry, ProviderConfig

logger = logging.getLogger(__name__)

# Curated latest models per direct provider (native API slugs). Used when live fetch is unavailable.
CURATED_MODELS: Dict[str, List[Dict[str, str]]] = {
    "openrouter": [
        {"id": "poolside/laguna-s-2.1:free", "name": "Laguna S2.1 (Free)"},
        {"id": "meta-llama/llama-3.3-70b-instruct:free", "name": "Llama 3.3 70B (Free)"},
        {"id": "qwen/qwen3-next-80b-a3b-instruct:free", "name": "Qwen3 Next 80B (Free)"},
        {"id": "openai/gpt-oss-120b:free", "name": "GPT OSS 120B (Free)"},
        {"id": "google/gemma-4-31b-it:free", "name": "Gemma 4 31B (Free)"},
    ],
    "openai": [
        {"id": "gpt-5.6-luna", "name": "GPT-5.6 Luna"},
        {"id": "gpt-5.6-luna-pro", "name": "GPT-5.6 Luna Pro"},
        {"id": "gpt-6-astra", "name": "GPT-6 Astra"},
        {"id": "gpt-4o", "name": "GPT-4o"},
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
        {"id": "o3", "name": "o3"},
        {"id": "o3-mini", "name": "o3 Mini"},
    ],
    "anthropic": [
        {"id": "claude-opus-5", "name": "Claude Opus 5"},
        {"id": "claude-sonnet-5", "name": "Claude Sonnet 5"},
        {"id": "claude-fable-5.1", "name": "Claude Fable 5.1"},
        {"id": "claude-haiku-4-20250514", "name": "Claude Haiku 4"},
    ],
    "gemini": [
        {"id": "gemini-3.8-flash", "name": "Gemini 3.8 Flash"},
        {"id": "gemini-3.7-flash", "name": "Gemini 3.7 Flash"},
        {"id": "gemini-3.5-flash-lite", "name": "Gemini 3.5 Flash Lite"},
        {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro"},
    ],
    "xai": [
        {"id": "grok-4.6", "name": "Grok 4.6"},
        {"id": "grok-4.5", "name": "Grok 4.5"},
        {"id": "grok-4.20", "name": "Grok 4.20"},
        {"id": "grok-4.3", "name": "Grok 4.3"},
    ],
    "qwen": [
        {"id": "qwen3.8-max", "name": "Qwen3.8 Max"},
        {"id": "qwen3.8-flash", "name": "Qwen3.8 Flash"},
        {"id": "qwen3.7-plus", "name": "Qwen3.7 Plus"},
        {"id": "qwen3.7-max", "name": "Qwen3.7 Max"},
    ],
    "local": [
        {"id": "llama3.3", "name": "Llama 3.3"},
        {"id": "llama4", "name": "Llama 4"},
        {"id": "qwen3", "name": "Qwen 3"},
        {"id": "gemma3", "name": "Gemma 3"},
    ],
}


def _is_openai_chat_model(model_id: str) -> bool:
    lower = model_id.lower()
    if any(x in lower for x in ("embed", "whisper", "tts", "dall-e", "moderation", "realtime")):
        return False
    return lower.startswith(("gpt-", "o", "chatgpt-"))


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

            if not models:
                models = self._get_fallback_models(provider)

            self._cache[cache_key] = {"models": models, "_timestamp": now}
            return models
        except Exception as e:
            logger.warning("Failed to fetch models for %s: %s", provider, e)
            return self._get_fallback_models(provider)

    def _fetch_openrouter_models(self) -> List[Dict[str, Any]]:
        api_key = settings.OPENROUTER_API_KEY
        headers = {"HTTP-Referer": "https://cadensend.app", "X-Title": "Cadensend"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        url = f"{settings.OPENROUTER_BASE_URL}/models"
        response = httpx.get(url, headers=headers, timeout=12.0)
        response.raise_for_status()
        data = response.json()

        models = []
        for item in data.get("data", []):
            model_id = item.get("id", "")
            if not model_id or "embed" in model_id.lower():
                continue
            models.append({
                "id": model_id,
                "name": item.get("name", model_id),
                "description": item.get("description", ""),
                "context_length": item.get("context_length", 4096),
                "pricing": item.get("pricing", {}),
            })
        models.sort(key=lambda m: (not str(m["id"]).endswith(":free"), str(m["id"])))
        return models

    def _fetch_openai_models(self) -> List[Dict[str, Any]]:
        api_key = settings.OPENAI_API_KEY
        if not api_key:
            return self._get_fallback_models("openai")

        base = (settings.OPENAI_BASE_URL or "https://api.openai.com/v1").rstrip("/")
        response = httpx.get(f"{base}/models", headers={"Authorization": f"Bearer {api_key}"}, timeout=12.0)
        response.raise_for_status()
        data = response.json()

        models = []
        for item in data.get("data", []):
            model_id = item.get("id", "")
            if not model_id or not _is_openai_chat_model(model_id):
                continue
            models.append({"id": model_id, "name": model_id, "description": ""})
        models.sort(key=lambda m: m["id"], reverse=True)
        return models

    def _fetch_anthropic_models(self) -> List[Dict[str, Any]]:
        return [{**m, "description": ""} for m in CURATED_MODELS["anthropic"]]

    def _fetch_gemini_models(self) -> List[Dict[str, Any]]:
        api_key = settings.GOOGLE_API_KEY
        if not api_key:
            return self._get_fallback_models("gemini")

        response = httpx.get(
            f"https://generativelanguage.googleapis.com/v1/models?key={api_key}",
            timeout=12.0,
        )
        response.raise_for_status()
        data = response.json()

        models = []
        for item in data.get("models", []):
            full_name = item.get("name", "")
            model_id = full_name.removeprefix("models/")
            if not model_id or "gemini" not in model_id.lower():
                continue
            methods = item.get("supportedGenerationMethods") or []
            if "generateContent" not in methods:
                continue
            models.append({
                "id": model_id,
                "name": item.get("displayName", model_id),
                "description": "",
            })
        models.sort(key=lambda m: m["id"], reverse=True)
        return models or self._get_fallback_models("gemini")

    def _fetch_xai_models(self) -> List[Dict[str, Any]]:
        return self._fetch_openai_compatible_models(
            "https://api.x.ai/v1/models",
            settings.XAI_API_KEY,
            "xai",
        )

    def _fetch_qwen_models(self) -> List[Dict[str, Any]]:
        return self._fetch_openai_compatible_models(
            "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
            settings.QWEN_API_KEY,
            "qwen",
        )

    def _fetch_openai_compatible_models(
        self, url: str, api_key: str, provider: str
    ) -> List[Dict[str, Any]]:
        if not api_key:
            return self._get_fallback_models(provider)

        response = httpx.get(url, headers={"Authorization": f"Bearer {api_key}"}, timeout=12.0)
        response.raise_for_status()
        data = response.json()

        models = []
        for item in data.get("data", []):
            model_id = item.get("id", "")
            if not model_id:
                continue
            models.append({
                "id": model_id,
                "name": item.get("name", model_id),
                "description": "",
            })
        models.sort(key=lambda m: m["id"], reverse=True)
        return models or self._get_fallback_models(provider)

    def _fetch_local_models(self) -> List[Dict[str, Any]]:
        try:
            base = (settings.LOCAL_BASE_URL or "http://localhost:11434").rstrip("/").removesuffix("/v1")
            response = httpx.get(f"{base}/api/tags", timeout=5.0)
            data = response.json()

            models = []
            for item in data.get("models", []):
                name = item.get("name", "")
                if not name:
                    continue
                models.append({
                    "id": name,
                    "name": name,
                    "description": item.get("description", ""),
                    "size": item.get("size", 0),
                })
            if models:
                return models
        except Exception as e:
            logger.warning("Could not fetch local models: %s", e)
        return self._get_fallback_models("local")

    def _get_fallback_models(self, provider: str) -> List[Dict[str, Any]]:
        return [{**m, "description": m.get("description", "")} for m in CURATED_MODELS.get(provider, [])]

    def get_workspace_preferred_models(self, workspace_id: str) -> List[Dict[str, Any]]:
        """Get models preferred by workspace configuration."""
        from app.services.workspace_llm import get_workspace_llm_config

        config = get_workspace_llm_config(workspace_id)
        if not config:
            return [{"id": settings.DEFAULT_MODEL, "name": f"Default ({settings.DEFAULT_MODEL})"}]

        default_provider = config.get("provider") or settings.DEFAULT_PROVIDER
        default_model = config.get("default_model") or settings.DEFAULT_MODEL
        configs = config.get("configs") or {}
        preferred_models = configs.get("preferred_models", [])

        if not preferred_models:
            return [{"id": default_model, "provider": default_provider, "name": default_model}]

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
