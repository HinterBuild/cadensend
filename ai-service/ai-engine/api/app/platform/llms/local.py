import httpx
from typing import List, Optional, Dict, Any

from .base import LLMProvider, LLMMessage, LLMResponse, EmbedResponse


class LocalLLMProvider(LLMProvider):
    DEFAULT_BASE_URL = "http://localhost:11434"

    def __init__(self, config):
        self.config = config
        self.api_key = config.api_key
        self.base_url = config.base_url or self.DEFAULT_BASE_URL
        self.model = config.model
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=self.base_url)
        return self._client

    async def generate(
        self,
        messages: List[LLMMessage],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> LLMResponse:
        prompt = self._format_messages(messages)

        payload = {
            "model": self.model,
            "prompt": prompt,
            "temperature": temperature,
            "stream": False,
        }
        if max_tokens:
            payload["num_predict"] = max_tokens

        response = await self.client.post("/api/generate", json=payload)
        response.raise_for_status()
        data = response.json()

        return LLMResponse(
            content=data.get("response", ""),
            usage={"input": 0, "output": len(data.get("response", "").split())},
            model=self.model,
        )

    def _format_messages(self, messages: List[LLMMessage]) -> str:
        formatted = []
        for msg in messages:
            formatted.append(f"{msg.role}: {msg.content}")
        return "\n\n".join(formatted)

    async def embed(self, text: str) -> EmbedResponse:
        if "nomic" in self.base_url or "llama-cpp" in self.base_url:
            return await self._embed_ollama_format(text)
        raise NotImplementedError("Embedding not supported by this local model")

    async def _embed_ollama_format(self, text: str) -> EmbedResponse:
        response = await self.client.post(
            "/api/embeddings",
            json={"model": self.model, "prompt": text}
        )
        data = response.json()
        return EmbedResponse(embedding=data.get("embedding", []))

    def get_model_info(self) -> Dict[str, Any]:
        return {
            "provider": "local",
            "model": self.model,
            "base_url": self.base_url,
            "supports_embedding": True,
        }