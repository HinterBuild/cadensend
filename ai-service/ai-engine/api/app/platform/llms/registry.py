from typing import Dict, Type, Optional, List as ListType
from pydantic import BaseModel, validator
import os

from .base import LLMProvider


class ProviderConfig(BaseModel):
    provider: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: str = "default"
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    workspace_id: Optional[str] = None
    options: Optional[Dict[str, str]] = None

    class Config:
        extra = "allow"


class LLMRegistry:
    _providers: Dict[str, Type[LLMProvider]] = {}
    _configs: Dict[str, ProviderConfig] = {}

    @classmethod
    def register(cls, name: str, provider_class: Type[LLMProvider]):
        cls._providers[name] = provider_class

    @classmethod
    def unregister(cls, name: str):
        if name in cls._providers:
            del cls._providers[name]

    @classmethod
    def create(cls, config: ProviderConfig) -> LLMProvider:
        if config.provider not in cls._providers:
            raise ValueError(f"Unknown provider: {config.provider}")
        provider = cls._providers[config.provider](config)
        cls._configs[config.provider] = config
        return provider

    @classmethod
    def create_from_env(cls, provider: str, model: str = "default") -> LLMProvider:
        config = cls._build_config_from_env(provider, model)
        return cls.create(config)

    @classmethod
    def _build_config_from_env(cls, provider: str, model: str) -> ProviderConfig:
        env_vars = {
            "openrouter": ["OPENROUTER_API_KEY", "OPENROUTER_BASE_URL"],
            "openai": ["OPENAI_API_KEY", "OPENAI_BASE_URL"],
            "anthropic": ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"],
            "gemini": ["GOOGLE_API_KEY", "GOOGLE_BASE_URL"],
            "xai": ["XAI_API_KEY", "XAI_BASE_URL"],
            "qwen": ["QWEN_API_KEY", "QWEN_BASE_URL"],
            "local": ["LOCAL_BASE_URL"],
        }

        api_key = None
        base_url = None

        if provider in env_vars:
            for var in env_vars[provider]:
                if "API_KEY" in var and os.getenv(var):
                    api_key = os.getenv(var)
                if "BASE_URL" in var and os.getenv(var):
                    base_url = os.getenv(var)

        if provider == "local":
            base_url = base_url or "http://localhost:11434"

        return ProviderConfig(
            provider=provider,
            api_key=api_key,
            base_url=base_url,
            model=model,
        )

    @classmethod
    def get_config(cls, provider: str) -> Optional[ProviderConfig]:
        return cls._configs.get(provider)

    @classmethod
    def list_providers(cls) -> ListType[str]:
        return list(cls._providers.keys())

    @classmethod
    def get_model_info(cls, provider: str) -> Dict[str, str]:
        if provider not in cls._providers:
            return {}
        config = cls._configs.get(provider)
        if not config:
            config = cls._build_config_from_env(provider, "default")
        instance = cls._providers[provider](config)
        return instance.get_model_info()

    @classmethod
    def clear_configs(cls):
        cls._configs.clear()