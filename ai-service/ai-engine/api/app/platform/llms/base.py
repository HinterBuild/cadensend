from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class LLMMessage(BaseModel):
    role: str
    content: str


class LLMResponse(BaseModel):
    content: str
    usage: Optional[Dict[str, int]] = None
    finish_reason: Optional[str] = None
    model: Optional[str] = None


class EmbedResponse(BaseModel):
    embedding: List[float]
    usage: Optional[Dict[str, int]] = None


class LLMProvider(ABC):
    @abstractmethod
    async def generate(
        self,
        messages: List[LLMMessage],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> LLMResponse:
        pass

    @abstractmethod
    async def embed(self, text: str) -> EmbedResponse:
        pass

    @abstractmethod
    def get_model_info(self) -> Dict[str, Any]:
        pass


class ChatCompletionMessage(BaseModel):
    role: str
    content: str