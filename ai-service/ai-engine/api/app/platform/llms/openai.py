import httpx
from typing import List, Optional, Dict, Any
import os

from .base import LLMProvider, LLMMessage, LLMResponse, EmbedResponse


class OpenAIProvider(LLMProvider):
    DEFAULT_BASE_URL = "https://api.openai.com/v1"

    def __init__(self, config):
        self.config = config
        self.api_key = config.api_key
        self.base_url = config.base_url or self.DEFAULT_BASE_URL
        self.model = config.model
        self._client = None

    @property
    def client(self):
        if self._client is None:
            headers = {}
            if self.base_url != self.DEFAULT_BASE_URL:
                headers["OpenAI-Base-URL"] = self.base_url
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
            raise ValueError("OPENAI_API_KEY is required for OpenAI provider")

        payload = {
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens

        response = await self.client.post("/chat/completions", json=payload)
        response.raise_for_status()
        data = response.json()

        return LLMResponse(
            content=data["choices"][0]["message"]["content"],
            usage=data.get("usage", {}),
            finish_reason=data["choices"][0].get("finish_reason"),
            model=self.model,
        )

    async def embed(self, text: str) -> EmbedResponse:
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is required for OpenAI provider")

        embed_model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
        if "embedding" in self.model.lower():
            embed_model = self.model

        payload = {
            "model": embed_model,
            "input": text,
        }

        response = await self.client.post("/embeddings", json=payload)
        response.raise_for_status()
        data = response.json()

        return EmbedResponse(
            embedding=data["data"][0]["embedding"],
            usage=data.get("usage", {}),
        )

    def get_model_info(self) -> Dict[str, Any]:
        return {
            "provider": "openai",
            "model": self.model,
            "base_url": self.base_url,
            "supports_embedding": "embedding" in self.model.lower(),
        }