import httpx
from typing import List, Optional, Dict, Any

from .base import LLMProvider, LLMMessage, LLMResponse, EmbedResponse


class XAIProvider(LLMProvider):
    DEFAULT_BASE_URL = "https://api.x.ai"

    def __init__(self, config):
        self.config = config
        self.api_key = config.api_key
        self.base_url = config.base_url or self.DEFAULT_BASE_URL
        self.model = config.model or "grok-4.6"
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
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
            raise ValueError("XAI_API_KEY is required for xAI provider")

        payload = {
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens

        response = await self.client.post("/v1/chat/completions", json=payload)
        response.raise_for_status()
        data = response.json()

        return LLMResponse(
            content=data["choices"][0]["message"]["content"],
            usage=data.get("usage", {}),
            finish_reason=data["choices"][0].get("finish_reason"),
            model=self.model,
        )

    async def embed(self, text: str) -> EmbedResponse:
        raise NotImplementedError("xAI does not provide embedding API")

    def get_model_info(self) -> Dict[str, Any]:
        return {
            "provider": "xai",
            "model": self.model,
            "base_url": self.base_url,
            "supports_embedding": False,
        }