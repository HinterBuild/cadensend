"""OpenRouter model gateway for every AI call in the engine."""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List, Optional

from langchain_openai import ChatOpenAI
from openai import OpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)


def openrouter_api_key() -> str:
    """Return the OpenRouter key, or a placeholder so clients can construct."""
    key = (settings.OPENROUTER_API_KEY or "").strip()
    return key or "not-configured"


class ModelService:
    """LLM and embedding calls go through OpenRouter only."""

    def __init__(self, model: Optional[str] = None):
        self.default_model = settings.DEFAULT_MODEL
        self.embedding_model_name = settings.EMBEDDING_MODEL
        self.model = self.resolve_model(model)
        if openrouter_api_key() == "not-configured":
            logger.warning(
                "OPENROUTER_API_KEY is not set; configure it before running generation jobs"
            )
        self.client = OpenAI(
            base_url=settings.OPENROUTER_BASE_URL,
            api_key=openrouter_api_key(),
            default_headers={
                "HTTP-Referer": "https://cadensend.app",
                "X-Title": "Cadensend",
            },
        )

    def resolve_model(self, model: Optional[str] = None) -> str:
        """Use an explicit model when provided, otherwise the ENV default."""
        chosen = (model or "").strip()
        return chosen or self.default_model

    def get_chat_model(
        self,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000,
    ) -> ChatOpenAI:
        """LangChain chat model pointed at OpenRouter."""
        return ChatOpenAI(
            base_url=settings.OPENROUTER_BASE_URL,
            api_key=openrouter_api_key(),
            model=self.resolve_model(model),
            temperature=temperature,
            max_tokens=max_tokens,
        )

    def generate_text(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000,
    ) -> str:
        """Synchronous chat completion via OpenRouter."""
        model_id = self.resolve_model(model)
        start_time = time.time()
        response = self.client.chat.completions.create(
            model=model_id,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        result = response.choices[0].message.content or ""
        logger.info("Generated response in %.2fs using %s", time.time() - start_time, model_id)
        return result

    async def generate_response(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000,
    ) -> str:
        """Generate a chat completion from the configured OpenRouter model."""
        try:
            return self.generate_text(messages, model=model, temperature=temperature, max_tokens=max_tokens)
        except Exception as e:
            logger.error("Failed to generate response: %s", e)
            raise

    async def generate_structured_output(
        self,
        messages: List[Dict[str, str]],
        schema: Dict[str, Any],
        model: Optional[str] = None,
        max_retries: int = 1,
        temperature: float = 0.1,
        max_tokens: int = 4000,
    ) -> Dict[str, Any]:
        """Generate structured JSON output from the LLM."""
        model_id = self.resolve_model(model)
        last_error: Optional[Exception] = None

        for attempt in range(max_retries + 1):
            try:
                response = self.client.chat.completions.create(
                    model=model_id,
                    messages=messages + [
                        {
                            "role": "user",
                            "content": f"Output valid JSON matching this schema: {json.dumps(schema)}",
                        }
                    ],
                    temperature=temperature,
                    max_tokens=max_tokens,
                    response_format={"type": "json_object"},
                )
                result = response.choices[0].message.content
                parsed = json.loads(result)
                logger.info("Generated structured output (attempt %d) using %s", attempt + 1, model_id)
                return parsed
            except Exception as e:
                last_error = e
                logger.warning("Attempt %d failed: %s", attempt + 1, e)
                if attempt < max_retries:
                    continue

        raise last_error

    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Embed texts with the OpenRouter embedding model."""
        try:
            response = self.client.embeddings.create(
                model=self.embedding_model_name,
                input=texts,
                encoding_format="float",
            )
            ordered = sorted(response.data, key=lambda item: item.index)
            embeddings = [item.embedding for item in ordered]
            logger.info("Generated %d embeddings with %s", len(embeddings), self.embedding_model_name)
            return embeddings
        except Exception as e:
            logger.error("Failed to generate embeddings: %s", e)
            raise

    def list_chat_models(self) -> Dict[str, Any]:
        """List OpenRouter chat models; default is always first."""
        models = [
            {
                "id": self.default_model,
                "name": f"Default ({self.default_model})",
                "is_default": True,
            }
        ]
        seen = {self.default_model}
        try:
            listed = self.client.models.list()
            extras = []
            for item in listed.data:
                model_id = item.id
                if not model_id or model_id in seen:
                    continue
                if "embed" in model_id.lower():
                    continue
                extras.append(
                    {
                        "id": model_id,
                        "name": getattr(item, "name", None) or model_id,
                        "is_default": False,
                    }
                )
                seen.add(model_id)
            extras.sort(key=lambda m: (0 if m["id"].endswith(":free") else 1, m["id"]))
            models.extend(extras)
        except Exception as e:
            logger.warning("Could not list OpenRouter models: %s", e)

        return {
            "default_model": self.default_model,
            "embedding_model": self.embedding_model_name,
            "models": models,
        }
