import httpx
from typing import List, Optional, Dict, Any

from .base import LLMProvider, LLMMessage, LLMResponse, EmbedResponse


class AnthropicProvider(LLMProvider):
    DEFAULT_BASE_URL = "https://api.anthropic.com"

    def __init__(self, config):
        self.config = config
        self.api_key = config.api_key
        self.base_url = config.base_url or self.DEFAULT_BASE_URL
        self.model = config.model
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "x-api-key": self.api_key or "",
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                }
            )
        return self._client

    async def generate(
        self,
        messages: List[LLMMessage],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> LLMResponse:
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY is required for Anthropic provider")

        system_msg = next((m for m in messages if m.role == "system"), None)
        user_messages = [m for m in messages if m.role != "system"]

        payload = {
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in user_messages],
            "temperature": temperature,
            "max_tokens": max_tokens or 4096,
        }
        if system_msg:
            payload["system"] = system_msg.content

        response = await self.client.post("/v1/messages", json=payload)
        response.raise_for_status()
        data = response.json()

        return LLMResponse(
            content=data["content"][0]["text"],
            usage={
                "input": data.get("usage", {}).get("input_tokens", 0),
                "output": data.get("usage", {}).get("output_tokens", 0),
            },
            finish_reason=data.get("stop_reason"),
            model=self.model,
        )

    async def embed(self, text: str) -> EmbedResponse:
        raise NotImplementedError("Anthropic does not provide embedding API")

    def get_model_info(self) -> Dict[str, Any]:
        return {
            "provider": "anthropic",
            "model": self.model,
            "base_url": self.base_url,
            "supports_embedding": False,
        }