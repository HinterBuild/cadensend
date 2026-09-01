import httpx
from typing import List, Optional, Dict, Any

from .base import LLMProvider, LLMMessage, LLMResponse, EmbedResponse


class GeminiProvider(LLMProvider):
    DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com"

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
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY is required for Gemini provider")

        system_msg = next((m for m in messages if m.role == "system"), None)
        user_messages = [m for m in messages if m.role != "system"]

        prompt_parts = []
        if system_msg:
            prompt_parts.append(f"System: {system_msg.content}")
        for msg in user_messages:
            prompt_parts.append(f"{msg.role.capitalize()}: {msg.content}")

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": "\n".join(prompt_parts)}]
                }
            ]
        }

        if max_tokens:
            payload["generationConfig"] = {
                "maxOutputTokens": max_tokens,
                "temperature": temperature,
            }
        else:
            payload["generationConfig"] = {"temperature": temperature}

        url = f"/v1/models/{self.model}:generateContent?key={self.api_key}"
        response = await self.client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()

        content = ""
        for part in data.get("candidates", [{}])[0].get("content", {}).get("parts", []):
            if "text" in part:
                content += part["text"]

        usage = data.get("usageMetadata", {})
        return LLMResponse(
            content=content,
            usage={
                "input": usage.get("promptTokenCount", 0),
                "output": usage.get("candidatesTokenCount", 0),
            },
            model=self.model,
        )

    async def embed(self, text: str) -> EmbedResponse:
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY is required for Gemini provider")

        payload = {
            "content": {"parts": [{"text": text}]}
        }

        url = f"/v1/models/{self.model}:embedContent?key={self.api_key}"
        response = await self.client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()

        return EmbedResponse(
            embedding=data["embedding"]["vector"]["values"],
            usage={},
        )

    def get_model_info(self) -> Dict[str, Any]:
        return {
            "provider": "gemini",
            "model": self.model,
            "base_url": self.base_url,
            "supports_embedding": "embedding" in self.model.lower(),
        }