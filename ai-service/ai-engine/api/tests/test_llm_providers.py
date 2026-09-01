"""Tests for multi-provider LLM gateway."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.platform.llms import (
    LLMRegistry,
    ProviderConfig,
    LLMMessage,
    LLMResponse,
    OpenRouterProvider,
    OpenAIProvider,
    AnthropicProvider,
    GeminiProvider,
    LocalLLMProvider,
    register_all_providers,
)


@pytest.fixture(autouse=True)
def _register_providers():
    register_all_providers()
    yield
    LLMRegistry._providers.clear()
    LLMRegistry._configs.clear()


class TestProviderConfig:
    def test_default_provider_is_openrouter(self):
        config = ProviderConfig(provider="openrouter", model="test-model")
        assert config.provider == "openrouter"
        assert config.model == "test-model"

    def test_explicit_api_key_stored(self):
        config = ProviderConfig(
            provider="openai",
            api_key="sk-test-123",
            model="gpt-4o",
        )
        assert config.api_key == "sk-test-123"


class TestOpenRouterProvider:
    def test_get_model_info(self):
        config = ProviderConfig(
            provider="openrouter",
            api_key="test-key",
            model="openai/gpt-4o",
        )
        provider = OpenRouterProvider(config)
        info = provider.get_model_info()
        assert info["provider"] == "openrouter"
        assert info["model"] == "openai/gpt-4o"
        assert info["base_url"] == "https://openrouter.ai/api/v1"
        assert info["supports_embedding"] is True

    @pytest.mark.asyncio
    async def test_generate_requires_api_key(self):
        config = ProviderConfig(provider="openrouter", api_key=None, model="test-model")
        provider = OpenRouterProvider(config)
        with pytest.raises(ValueError, match="OPENROUTER_API_KEY"):
            await provider.generate([LLMMessage(role="user", content="hello")])

    @pytest.mark.asyncio
    async def test_generate_success(self):
        config = ProviderConfig(
            provider="openrouter",
            api_key="test-key",
            model="test-model",
        )
        provider = OpenRouterProvider(config)
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "Hello back!"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
        }

        with patch.object(provider, "_client", new_callable=MagicMock) as mock_client:
            mock_client.post = AsyncMock(return_value=mock_response)
            result = await provider.generate([LLMMessage(role="user", content="hello")])

        assert result.content == "Hello back!"
        assert result.finish_reason == "stop"


class TestAnthropicProvider:
    def test_get_model_info(self):
        config = ProviderConfig(
            provider="anthropic",
            api_key="test-key",
            model="claude-3-5-sonnet-20241022",
        )
        provider = AnthropicProvider(config)
        info = provider.get_model_info()
        assert info["provider"] == "anthropic"
        assert info["supports_embedding"] is False

    @pytest.mark.asyncio
    async def test_embed_not_supported(self):
        config = ProviderConfig(
            provider="anthropic",
            api_key="test-key",
            model="claude-3-5-sonnet-20241022",
        )
        provider = AnthropicProvider(config)
        with pytest.raises(NotImplementedError):
            await provider.embed("test text")


class TestLocalLLMProvider:
    def test_default_base_url(self):
        config = ProviderConfig(provider="local", model="llama3")
        provider = LocalLLMProvider(config)
        assert provider.base_url == "http://localhost:11434"

    def test_custom_base_url(self):
        config = ProviderConfig(
            provider="local",
            base_url="http://my-ollama:11434",
            model="llama3",
        )
        provider = LocalLLMProvider(config)
        assert provider.base_url == "http://my-ollama:11434"


class TestLLMRegistry:
    def test_register_and_create(self):
        registry = LLMRegistry
        registry.register("test", OpenRouterProvider)
        config = ProviderConfig(provider="test", api_key="key", model="m")
        provider = registry.create(config)
        assert isinstance(provider, OpenRouterProvider)

    def test_unknown_provider_raises(self):
        with pytest.raises(ValueError, match="Unknown provider"):
            LLMRegistry.create(ProviderConfig(provider="nonexistent", model="m"))

    def test_list_providers(self):
        providers = LLMRegistry.list_providers()
        assert "openrouter" in providers
        assert "openai" in providers
        assert "anthropic" in providers
        assert "gemini" in providers
        assert "local" in providers

    def test_build_config_from_env_openai(self):
        config = LLMRegistry._build_config_from_env("openai", "gpt-4o")
        assert config.provider == "openai"
        assert config.model == "gpt-4o"

    def test_build_config_from_env_local(self):
        config = LLMRegistry._build_config_from_env("local", "llama3")
        assert config.provider == "local"
        assert config.model == "llama3"
        assert config.base_url == "http://localhost:11434"


class TestMultiProviderModelService:
    def test_fallback_to_openrouter(self):
        from app.services.model_service import MultiProviderModelService
        service = MultiProviderModelService()
        config = service.config
        assert config.provider == "openrouter"

    def test_list_providers(self):
        from app.services.model_service import MultiProviderModelService
        service = MultiProviderModelService()
        providers = service.list_providers()
        assert "openrouter" in providers
        assert "openai" in providers
        assert "anthropic" in providers

    def test_with_provider_method(self):
        from app.services.model_service import MultiProviderModelService
        service = MultiProviderModelService()
        new_service = service.with_provider("openai", model="gpt-4o")
        assert new_service.config.provider == "openai"
        assert new_service.config.model == "gpt-4o"