from .base import LLMProvider, LLMMessage, LLMResponse, EmbedResponse
from .registry import LLMRegistry, ProviderConfig
from .openrouter import OpenRouterProvider
from .openai import OpenAIProvider
from .anthropic import AnthropicProvider
from .gemini import GeminiProvider
from .local import LocalLLMProvider
from .xai import XAIProvider
from .qwen import QwenProvider

__all__ = [
    "LLMProvider",
    "LLMMessage",
    "LLMResponse",
    "EmbedResponse",
    "LLMRegistry",
    "ProviderConfig",
    "OpenRouterProvider",
    "OpenAIProvider",
    "AnthropicProvider",
    "GeminiProvider",
    "LocalLLMProvider",
    "XAIProvider",
    "QwenProvider",
]


def register_all_providers():
    LLMRegistry.register("openrouter", OpenRouterProvider)
    LLMRegistry.register("openai", OpenAIProvider)
    LLMRegistry.register("anthropic", AnthropicProvider)
    LLMRegistry.register("gemini", GeminiProvider)
    LLMRegistry.register("local", LocalLLMProvider)
    LLMRegistry.register("xai", XAIProvider)
    LLMRegistry.register("qwen", QwenProvider)


__all__ += ["register_all_providers"]